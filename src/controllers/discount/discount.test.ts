import { Request, Response } from 'express';
import { getDiscounts, getDiscount } from './index';
import { Discount, LightspeedEntityMap } from '@/database/models';

jest.mock('@/database/models');
jest.mock('@/utils/logger');

describe('Discount Controllers', () => {
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

  describe('getDiscounts', () => {
    it('should return paginated discount records when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_discount_id: 'disc_1',
            name: 'Holiday Discount',
            discount_amount: 10.00,
            discount_percent: 0.0000,
            require_customer: false,
            archived: false,
            toJSON: function() { return this; }
          },
        ],
      };

      (Discount.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getDiscounts(mockRequest as Request, mockResponse as Response);

      expect(Discount.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should return non-paginated discount records by default', async () => {
      const mockResult = [
        {
          id: 1,
          lightspeed_discount_id: 'disc_1',
          name: 'Holiday Discount',
          discount_amount: 10.00,
          discount_percent: 0.0000,
          require_customer: false,
          archived: false,
          toJSON: function() { return this; }
        },
      ];

      (Discount.findAll as jest.Mock).mockResolvedValue(mockResult);

      await getDiscounts(mockRequest as Request, mockResponse as Response);

      expect(Discount.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array)
      );
    });
  });

  describe('getDiscount', () => {
    it('should return a single discount details with sync info', async () => {
      mockRequest.params = { id: '1' };

      const mockDiscount = {
        id: 1,
        lightspeed_discount_id: 'disc_1',
        name: 'Holiday Discount',
        toJSON: function() { return this; }
      };

      const mockSync = {
        id: 10,
        entity_type: 'discount',
        lightspeed_id: 'disc_1',
        local_id: 1,
        last_sync: new Date(),
        hash: 'abc',
      };

      (Discount.findByPk as jest.Mock).mockResolvedValue(mockDiscount);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue(mockSync);

      await getDiscount(mockRequest as Request, mockResponse as Response);

      expect(Discount.findByPk).toHaveBeenCalledWith(1);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          id: 1,
          lightspeed_sync_info: expect.objectContaining({
            entity_map_id: 10,
            lightspeed_id: 'disc_1',
          })
        })
      );
    });

    it('should return error for invalid discount ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getDiscount(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid discount ID.');
    });

    it('should return error when discount not found', async () => {
      mockRequest.params = { id: '99' };
      (Discount.findByPk as jest.Mock).mockResolvedValue(null);

      await getDiscount(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Discount not found.');
    });
  });
});
