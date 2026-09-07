const mockPaymentIntentsCreate = jest.fn();
const mockWebhooksConstructEvent = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: (...args: any[]) => mockPaymentIntentsCreate(...args),
    },
    webhooks: {
      constructEvent: (...args: any[]) => mockWebhooksConstructEvent(...args),
    },
  }));
});

import { Request, Response } from 'express';
import {
  Order,
  OrderItem,
  InventoryReservation,
  ProductInventory,
  LightspeedSyncJob,
  PaymentTransaction,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import sequelize from '@/database/connection';
import config from '@/config';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

import { createPaymentIntent, handleWebhook } from './index';

describe('Checkout Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockTransaction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      body: {},
    };

    mockResponse = {
      sendSuccess: jest.fn(),
      sendError: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    } as unknown as Partial<Response>;

    mockTransaction = {
      LOCK: { UPDATE: 'UPDATE' },
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
    };

    jest.spyOn(sequelize, 'transaction').mockImplementation(async (callback?: any) => {
      if (typeof callback === 'function') {
        return callback(mockTransaction);
      }
      return mockTransaction;
    });

    ProductInventory.findOne = jest.fn();
    InventoryReservation.sum = jest.fn();
    InventoryReservation.create = jest.fn();
    InventoryReservation.update = jest.fn();
    Order.create = jest.fn();
    Order.findOne = jest.fn();
    OrderItem.create = jest.fn();
    LightspeedSyncJob.create = jest.fn();
    PaymentTransaction.create = jest.fn();

    LightspeedService.getLiveQoh = jest.fn();
    LightspeedService.resolveCustomer = jest.fn();
    LightspeedService.resolveActiveRegister = jest.fn();
    LightspeedService.resolveActiveEmployee = jest.fn();
    LightspeedService.createOpenSale = jest.fn();
  });

  describe('createPaymentIntent', () => {
    it('should return validation error if required fields are missing', async () => {
      mockRequest.body = { email: 'test@example.com' };

      await createPaymentIntent(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'ERR_VALIDATION_FAILED',
        expect.objectContaining({ error: expect.stringContaining('Missing required parameters') })
      );
    });

    it('should return error if product inventory is not found', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        items: [{ productId: 999, quantity: 2 }],
      };

      (ProductInventory.findOne as jest.Mock).mockResolvedValue(null);

      await createPaymentIntent(mockRequest as Request, mockResponse as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        expect.stringContaining('inventory not found'),
        expect.anything()
      );
    });

    it('should return ERR_INSUFFICIENT_STOCK if effective stock is less than requested quantity', async () => {
      mockRequest.body = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        items: [{ productId: 1, quantity: 5 }],
      };

      const mockInventory = {
        product_id: 1,
        shop_id: 1,
        qoh: 10,
        product: { lightspeed_item_id: '101', price: 20 },
      };
      (ProductInventory.findOne as jest.Mock).mockResolvedValue(mockInventory);
      (LightspeedService.getLiveQoh as jest.Mock).mockResolvedValue(4);
      (InventoryReservation.sum as jest.Mock).mockResolvedValue(1); // 4 live - 1 reserved = 3 effective stock < 5

      await createPaymentIntent(mockRequest as Request, mockResponse as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'ERR_INSUFFICIENT_STOCK',
        expect.anything()
      );
    });

    it('should create order, reserve inventory, create open sale, and create Stripe PaymentIntent successfully', async () => {
      mockRequest.body = {
        email: 'buyer@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        phone: '4165551234',
        shippingAddress: {
          address1: '123 Main St',
          city: 'Richmond Hill',
          state: 'Ontario',
          zip: 'L4C 3B6',
        },
        billingAddress: {
          address1: '123 Main St',
          city: 'Richmond Hill',
        },
        items: [{ productId: 1, quantity: 2 }],
      };

      const mockInventory = {
        product_id: 1,
        shop_id: 1,
        qoh: 10,
        product: { lightspeed_item_id: '101', price: 50 },
      };
      (ProductInventory.findOne as jest.Mock).mockResolvedValue(mockInventory);
      (LightspeedService.getLiveQoh as jest.Mock).mockResolvedValue(10);
      (InventoryReservation.sum as jest.Mock).mockResolvedValue(0);

      const mockCreatedOrder = {
        id: 12,
        order_uuid: 'mock-order-uuid-1234',
        update: jest.fn().mockResolvedValue(true),
      };
      (Order.create as jest.Mock).mockResolvedValue(mockCreatedOrder);
      (OrderItem.create as jest.Mock).mockResolvedValue({});
      (InventoryReservation.create as jest.Mock).mockResolvedValue({ id: 101 });

      (LightspeedService.resolveCustomer as jest.Mock).mockResolvedValue('ls_cust_999');
      (LightspeedService.resolveActiveRegister as jest.Mock).mockResolvedValue({ registerId: '6', shopId: '1' });
      (LightspeedService.resolveActiveEmployee as jest.Mock).mockResolvedValue('1');
      (LightspeedService.createOpenSale as jest.Mock).mockResolvedValue({
        saleID: 'ls_sale_555',
        ticketNumber: '210000000555',
        calcTotal: '113.00',
        taxTotal: '13.00',
      });

      mockPaymentIntentsCreate.mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
      });

      await createPaymentIntent(mockRequest as Request, mockResponse as Response);

      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(InventoryReservation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 12,
          product_id: 1,
          quantity: 2,
          status: 'active',
        }),
        expect.anything()
      );
      expect(LightspeedService.createOpenSale).toHaveBeenCalledWith(
        expect.objectContaining({
          completed: false,
          customerID: 'ls_cust_999',
          shopID: '1',
          registerID: '6',
        })
      );
      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 11300,
          currency: 'cad',
          capture_method: 'manual',
          metadata: {
            orderId: '12',
            lightspeedSaleId: 'ls_sale_555',
          },
        })
      );
      expect(mockCreatedOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          total_amount: 113.0,
          tax_amount: 13.0,
          lightspeed_sale_id: 'ls_sale_555',
          ticket_number: '210000000555',
          stripe_payment_intent: 'pi_test_123',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          clientSecret: 'pi_test_123_secret',
          orderId: 'mock-order-uuid-1234',
          id: 12,
          ticketNumber: '210000000555',
          total: '113.00',
        })
      );
    });

    it('should execute compensating release of reservation if open sale API fails', async () => {
      mockRequest.body = {
        email: 'buyer@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        items: [{ productId: 1, quantity: 1 }],
      };

      const mockInventory = {
        product_id: 1,
        shop_id: 1,
        qoh: 5,
        product: { lightspeed_item_id: '101', price: 25 },
      };
      (ProductInventory.findOne as jest.Mock).mockResolvedValue(mockInventory);
      (LightspeedService.getLiveQoh as jest.Mock).mockResolvedValue(5);
      (InventoryReservation.sum as jest.Mock).mockResolvedValue(0);

      const mockCreatedOrder = {
        id: 15,
        order_uuid: 'mock-order-uuid-5555',
        update: jest.fn().mockResolvedValue(true),
      };
      (Order.create as jest.Mock).mockResolvedValue(mockCreatedOrder);

      (LightspeedService.resolveCustomer as jest.Mock).mockRejectedValue(new Error('Lightspeed API Offline'));

      await createPaymentIntent(mockRequest as Request, mockResponse as Response);

      expect(InventoryReservation.update).toHaveBeenCalledWith(
        { status: 'released' },
        expect.objectContaining({ where: { order_id: 15 } })
      );
      expect(mockCreatedOrder.update).toHaveBeenCalledWith(
        { status: 'sync_failed' },
        expect.anything()
      );
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'Lightspeed API Offline',
        expect.anything()
      );
    });
  });

  describe('handleWebhook', () => {
    it('should return 400 if stripe signature or webhook secret is missing', async () => {
      mockRequest.headers = {};
      await handleWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should process payment_intent.amount_capturable_updated and enqueue COMPLETE_SALE', async () => {
      mockRequest.headers = { 'stripe-signature': 'sig_123' };
      (config.stripe as any).webhookSecret = 'whsec_test';

      const mockEvent = {
        type: 'payment_intent.amount_capturable_updated',
        data: {
          object: {
            id: 'pi_test_999',
            amount: 5000,
            metadata: {
              orderId: '20',
              lightspeedSaleId: 'ls_sale_20',
            },
          },
        },
      };
      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const mockOrder = {
        id: 20,
        status: 'pending_payment',
        update: jest.fn().mockResolvedValue(true),
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await handleWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockOrder.update).toHaveBeenCalledWith({ status: 'authorized' }, expect.anything());
      expect(LightspeedSyncJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'COMPLETE_SALE',
          payload: {
            orderId: 20,
            lightspeedSaleId: 'ls_sale_20',
            stripePaymentIntentId: 'pi_test_999',
            amount: '50.00',
          },
          status: 'pending',
        }),
        expect.anything()
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should ignore webhook if order status is already past pending_payment (Idempotency Guard)', async () => {
      mockRequest.headers = { 'stripe-signature': 'sig_123' };
      (config.stripe as any).webhookSecret = 'whsec_test';

      const mockEvent = {
        type: 'payment_intent.amount_capturable_updated',
        data: {
          object: {
            id: 'pi_test_999',
            amount: 5000,
            metadata: {
              orderId: '20',
              lightspeedSaleId: 'ls_sale_20',
            },
          },
        },
      };
      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const mockOrder = {
        id: 20,
        status: 'authorized', // Already authorized
        update: jest.fn(),
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await handleWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockOrder.update).not.toHaveBeenCalled();
      expect(LightspeedSyncJob.create).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should process payment_intent.payment_failed, release reservation, and enqueue VOID_SALE', async () => {
      mockRequest.headers = { 'stripe-signature': 'sig_123' };
      (config.stripe as any).webhookSecret = 'whsec_test';

      const mockEvent = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_test_fail',
            amount: 4000,
            metadata: {
              orderId: '25',
              lightspeedSaleId: 'ls_sale_25',
            },
          },
        },
      };
      mockWebhooksConstructEvent.mockReturnValue(mockEvent);

      const mockOrder = {
        id: 25,
        status: 'pending_payment',
        update: jest.fn().mockResolvedValue(true),
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await handleWebhook(mockRequest as Request, mockResponse as Response);

      expect(mockOrder.update).toHaveBeenCalledWith({ status: 'cancelled' }, expect.anything());
      expect(InventoryReservation.update).toHaveBeenCalledWith(
        { status: 'released' },
        expect.objectContaining({ where: { order_id: 25 } })
      );
      expect(PaymentTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          order_id: 25,
          provider: 'stripe',
          transaction_id: 'pi_test_fail',
          status: 'failed',
        }),
        expect.anything()
      );
      expect(LightspeedSyncJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'VOID_SALE',
          payload: { lightspeedSaleId: 'ls_sale_25' },
        }),
        expect.anything()
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });
});
