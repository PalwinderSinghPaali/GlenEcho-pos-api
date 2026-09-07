import { Request, Response } from 'express';
import { getOrders, getOrder, updateOrder, deleteOrder } from './index';
import { Order, InventoryReservation, LightspeedSyncJob } from '@/database/models';
import sequelize from '@/database/connection';

jest.mock('@/database/models');
jest.mock('@/utils/logger');

describe('Order Controllers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockTransaction: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      query: {},
      params: {},
      body: {},
    };

    mockResponse = {
      sendSuccess: jest.fn(),
      sendPaginationSuccess: jest.fn(),
      sendError: jest.fn(),
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

    Order.findAndCountAll = jest.fn();
    Order.findOne = jest.fn();
    Order.findByPk = jest.fn();
    InventoryReservation.update = jest.fn();
    LightspeedSyncJob.create = jest.fn();
  });

  describe('getOrders', () => {
    it('should return paginated list of orders', async () => {
      mockRequest.query = { page: '1', limit: '10' };

      const mockOrders = [
        {
          id: 1,
          order_uuid: 'uuid-1',
          status: 'synced',
          total_amount: 113.0,
          toJSON: function () {
            return this;
          },
        },
      ];

      (Order.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 1,
        rows: mockOrders,
      });

      await getOrders(mockRequest as Request, mockResponse as Response);

      expect(Order.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 0,
          limit: 10,
        })
      );
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([expect.objectContaining({ id: 1 })]),
        1
      );
    });

    it('should filter orders by status and search keyword', async () => {
      mockRequest.query = { status: 'synced', search: 'Canada Post' };

      (Order.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 0,
        rows: [],
      });

      await getOrders(mockRequest as Request, mockResponse as Response);

      expect(Order.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'synced',
          }),
        })
      );
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalled();
    });

    it('should filter orders by ticketNumber', async () => {
      mockRequest.query = { ticketNumber: '210000000123' };

      (Order.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 1,
        rows: [{ id: 10, ticket_number: '210000000123', toJSON: () => ({ id: 10, ticket_number: '210000000123' }) }],
      });

      await getOrders(mockRequest as Request, mockResponse as Response);

      expect(Order.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            ticket_number: '210000000123',
          }),
        })
      );
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalled();
    });
  });

  describe('getOrder', () => {
    it('should return an order when found by numeric ID', async () => {
      mockRequest.params = { id: '5' };

      const mockOrder = {
        id: 5,
        order_uuid: 'uuid-5',
        status: 'authorized',
        items: [],
        toJSON: function () {
          return this;
        },
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await getOrder(mockRequest as Request, mockResponse as Response);

      expect(Order.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ id: 5 })
      );
    });

    it('should return an order when found by UUID', async () => {
      const validUUID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';
      mockRequest.params = { id: validUUID };

      const mockOrder = {
        id: 8,
        order_uuid: validUUID,
        status: 'shipped',
        items: [],
        toJSON: function () {
          return this;
        },
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await getOrder(mockRequest as Request, mockResponse as Response);

      expect(Order.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { order_uuid: validUUID },
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ order_uuid: validUUID })
      );
    });

    it('should return an order when found by ticket_number', async () => {
      mockRequest.params = { id: '210000000123' };

      const mockOrder = {
        id: 77,
        order_uuid: 'uuid-77',
        ticket_number: '210000000123',
        status: 'synced',
        items: [],
        toJSON: function () {
          return this;
        },
      };

      (Order.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockOrder);

      await getOrder(mockRequest as Request, mockResponse as Response);

      expect(Order.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ticket_number: '210000000123' },
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ ticket_number: '210000000123', ticketNumber: '210000000123' })
      );
    });

    it('should return error if invalid order ID format is provided', async () => {
      mockRequest.params = { id: 'not-a-number-or-uuid' };

      await getOrder(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'ERR_VALIDATION_FAILED',
        expect.objectContaining({ error: 'Invalid order ID format.' })
      );
    });

    it('should return error if order is not found', async () => {
      mockRequest.params = { id: '999' };
      (Order.findOne as jest.Mock).mockResolvedValue(null);

      await getOrder(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'ERR_ORDER_NOT_FOUND',
        expect.objectContaining({ error: 'Order not found.' })
      );
    });
  });

  describe('updateOrder', () => {
    it('should update tracking and carrier info', async () => {
      mockRequest.params = { id: '10' };
      mockRequest.body = {
        carrier: 'FedEx',
        tracking_number: '1234567890',
        estimated_delivery: '2026-09-10T12:00:00.000Z',
      };

      const mockOrder = {
        id: 10,
        status: 'synced',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);
      (Order.findByPk as jest.Mock).mockResolvedValue(mockOrder);

      await updateOrder(mockRequest as Request, mockResponse as Response);

      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          carrier: 'FedEx',
          tracking_number: '1234567890',
        }),
        expect.anything()
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalled();
    });

    it('should release reservations and enqueue VOID_SALE when status changes to cancelled', async () => {
      mockRequest.params = { id: '10' };
      mockRequest.body = { status: 'cancelled' };

      const mockOrder = {
        id: 10,
        status: 'pending_payment',
        lightspeed_sale_id: 'ls_sale_999',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);
      (Order.findByPk as jest.Mock).mockResolvedValue(mockOrder);

      await updateOrder(mockRequest as Request, mockResponse as Response);

      expect(InventoryReservation.update).toHaveBeenCalledWith(
        { status: 'released' },
        expect.objectContaining({ where: { order_id: 10 } })
      );
      expect(LightspeedSyncJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'VOID_SALE',
          payload: { lightspeedSaleId: 'ls_sale_999' },
        }),
        expect.anything()
      );
      expect(mockOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' }),
        expect.anything()
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    it('should return error if invalid status is passed', async () => {
      mockRequest.params = { id: '10' };
      mockRequest.body = { status: 'INVALID_STATUS' };

      const mockOrder = { id: 10, status: 'pending_payment' };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await updateOrder(mockRequest as Request, mockResponse as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'ERR_VALIDATION_FAILED',
        expect.objectContaining({ error: expect.stringContaining('Invalid status') })
      );
    });
  });

  describe('deleteOrder', () => {
    it('should cancel order, release reservations, and enqueue VOID_SALE', async () => {
      mockRequest.params = { id: '12' };

      const mockOrder = {
        id: 12,
        status: 'pending_payment',
        lightspeed_sale_id: 'ls_sale_12',
        update: jest.fn().mockResolvedValue(true),
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await deleteOrder(mockRequest as Request, mockResponse as Response);

      expect(mockOrder.update).toHaveBeenCalledWith({ status: 'cancelled' }, expect.anything());
      expect(InventoryReservation.update).toHaveBeenCalledWith(
        { status: 'released' },
        expect.objectContaining({ where: { order_id: 12 } })
      );
      expect(LightspeedSyncJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          job_type: 'VOID_SALE',
          payload: { lightspeedSaleId: 'ls_sale_12' },
        }),
        expect.anything()
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ message: expect.stringContaining('successfully cancelled') })
      );
    });

    it('should return error if order is already cancelled', async () => {
      mockRequest.params = { id: '12' };

      const mockOrder = {
        id: 12,
        status: 'cancelled',
      };
      (Order.findOne as jest.Mock).mockResolvedValue(mockOrder);

      await deleteOrder(mockRequest as Request, mockResponse as Response);

      expect(mockTransaction.rollback).toHaveBeenCalled();
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'ERR_VALIDATION_FAILED',
        expect.objectContaining({ error: 'Order is already cancelled.' })
      );
    });
  });
});
