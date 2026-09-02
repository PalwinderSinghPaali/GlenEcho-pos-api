import { Request, Response } from 'express';
import { getCustomerTypes, getCustomerType } from './index';
import { CustomerType, LightspeedEntityMap } from '@/database/models';

jest.mock('@/database/models');
jest.mock('@/utils/logger');

describe('CustomerType Controllers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      query: {},
      params: {},
    };
    mockResponse = {
      sendSuccess: jest.fn(),
      sendPaginationSuccess: jest.fn(),
      sendError: jest.fn(),
    } as unknown as Partial<Response>;
    jest.clearAllMocks();
  });

  describe('getCustomerTypes', () => {
    it('should return paginated customer types when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_customer_type_id: 'cust_type_1',
            name: 'Retail',
            tax_category_id: 1,
            discount_id: null,
            toJSON: function() { return this; }
          },
        ],
      };

      (CustomerType.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getCustomerTypes(mockRequest as Request, mockResponse as Response);

      expect(CustomerType.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should return non-paginated customer types by default', async () => {
      const mockResult = [
        {
          id: 1,
          lightspeed_customer_type_id: 'cust_type_1',
          name: 'Retail',
          tax_category_id: 1,
          discount_id: null,
          toJSON: function() { return this; }
        },
      ];

      (CustomerType.findAll as jest.Mock).mockResolvedValue(mockResult);

      await getCustomerTypes(mockRequest as Request, mockResponse as Response);

      expect(CustomerType.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array)
      );
    });
  });

  describe('getCustomerType', () => {
    it('should return a single customer type details with sync info', async () => {
      mockRequest.params = { id: '1' };

      const mockCustomerType = {
        id: 1,
        lightspeed_customer_type_id: 'cust_type_1',
        name: 'Retail',
        toJSON: function() { return this; }
      };

      const mockSync = {
        id: 11,
        entity_type: 'customer_type',
        lightspeed_id: 'cust_type_1',
        local_id: 1,
        last_sync: new Date(),
        hash: 'xyz',
      };

      (CustomerType.findByPk as jest.Mock).mockResolvedValue(mockCustomerType);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue(mockSync);

      await getCustomerType(mockRequest as Request, mockResponse as Response);

      expect(CustomerType.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          id: 1,
          lightspeed_sync_info: expect.objectContaining({
            entity_map_id: 11,
            lightspeed_id: 'cust_type_1',
          })
        })
      );
    });

    it('should return error for invalid customer type ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getCustomerType(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid customer type ID.');
    });

    it('should return error when customer type not found', async () => {
      mockRequest.params = { id: '99' };
      (CustomerType.findByPk as jest.Mock).mockResolvedValue(null);

      await getCustomerType(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Customer type not found.');
    });
  });
});
