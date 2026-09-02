import { Request, Response } from 'express';
import { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from './index';
import { Customer } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Customer Controllers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
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
    jest.clearAllMocks();
  });

  describe('getCustomers', () => {
    it('should return paginated customer records', async () => {
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            first_name: 'John',
            last_name: 'Doe',
            email_primary: 'john@example.com',
            archived: false,
            toJSON: function() { return this; }
          },
        ],
      };

      (Customer.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getCustomers(mockRequest as Request, mockResponse as Response);

      expect(Customer.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should apply search filters and status filters', async () => {
      mockRequest.query = { search: 'John', customerTypeId: '2', archived: 'false' };

      (Customer.findAndCountAll as jest.Mock).mockResolvedValue({ count: 0, rows: [] });

      await getCustomers(mockRequest as Request, mockResponse as Response);

      expect(Customer.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customer_type_id: 2,
            archived: false,
          }),
        })
      );
    });
  });

  describe('getCustomer', () => {
    it('should return a single customer details', async () => {
      mockRequest.params = { id: '1' };

      const mockCust = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        toJSON: function() { return this; }
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);

      await getCustomer(mockRequest as Request, mockResponse as Response);

      expect(Customer.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, expect.objectContaining({ id: 1 }));
    });

    it('should return error for invalid customer ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getCustomer(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid customer ID.');
    });

    it('should return error when customer not found', async () => {
      mockRequest.params = { id: '99' };
      (Customer.findByPk as jest.Mock).mockResolvedValue(null);

      await getCustomer(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Customer not found.');
    });
  });

  describe('createCustomer', () => {
    it('should create customer locally and enqueue a sync job', async () => {
      mockRequest.body = {
        first_name: 'Alice',
        last_name: 'Smith',
        email_primary: 'alice@example.com',
      };

      const mockCreated = {
        id: 5,
        first_name: 'Alice',
        last_name: 'Smith',
        toJSON: function() { return this; }
      };

      (Customer.create as jest.Mock).mockResolvedValue(mockCreated);
      (LightspeedService.enqueuePushJob as jest.Mock).mockResolvedValue({ id: 888 });

      await createCustomer(mockRequest as Request, mockResponse as Response);

      expect(Customer.create).toHaveBeenCalled();
      expect(LightspeedService.enqueuePushJob).toHaveBeenCalledWith('PUSH_CUSTOMER', { customerId: 5 });
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Customer created successfully and sync job queued.',
        })
      );
    });
  });

  describe('updateCustomer', () => {
    it('should update customer locally and queue push job', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { first_name: 'JohnUpdated' };

      const mockCust = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function() { return this; }
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.enqueuePushJob as jest.Mock).mockResolvedValue({ id: 889 });

      await updateCustomer(mockRequest as Request, mockResponse as Response);

      expect(mockCust.update).toHaveBeenCalledWith(expect.objectContaining({ first_name: 'JohnUpdated' }));
      expect(LightspeedService.enqueuePushJob).toHaveBeenCalledWith('PUSH_CUSTOMER', { customerId: 1 });
    });
  });

  describe('deleteCustomer', () => {
    it('should archive customer locally and queue archive job in Lightspeed if mapped', async () => {
      mockRequest.params = { id: '1' };

      const mockCust = {
        id: 1,
        lightspeed_customer_id: 'ls_cust_123',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function() { return this; }
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.enqueuePushJob as jest.Mock).mockResolvedValue({ id: 890 });

      await deleteCustomer(mockRequest as Request, mockResponse as Response);

      expect(mockCust.update).toHaveBeenCalledWith({ archived: true });
      expect(LightspeedService.enqueuePushJob).toHaveBeenCalledWith('PUSH_CUSTOMER_ARCHIVE', {
        lightspeedCustomerId: 'ls_cust_123',
      });
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Customer archived successfully and sync job queued.',
        })
      );
    });
  });
});
