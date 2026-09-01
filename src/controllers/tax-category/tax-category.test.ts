import { Request, Response } from 'express';
import { getTaxCategories, getTaxCategory } from './index';
import { TaxCategory, LightspeedEntityMap } from '@/database/models';

jest.mock('@/database/models');
jest.mock('@/utils/logger');

describe('TaxCategory Controllers', () => {
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

  describe('getTaxCategories', () => {
    it('should return paginated tax categories when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_tax_category_id: 'tax_cat_1',
            is_tax_inclusive: false,
            tax_1_name: 'HST',
            tax_2_name: null,
            tax_1_rate: 0.13,
            tax_2_rate: 0.00,
            toJSON: function() { return this; }
          },
        ],
      };

      (TaxCategory.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getTaxCategories(mockRequest as Request, mockResponse as Response);

      expect(TaxCategory.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should return non-paginated tax categories by default', async () => {
      const mockResult = [
        {
          id: 1,
          lightspeed_tax_category_id: 'tax_cat_1',
          is_tax_inclusive: false,
          tax_1_name: 'HST',
          tax_2_name: null,
          tax_1_rate: 0.13,
          tax_2_rate: 0.00,
          toJSON: function() { return this; }
        },
      ];

      (TaxCategory.findAll as jest.Mock).mockResolvedValue(mockResult);

      await getTaxCategories(mockRequest as Request, mockResponse as Response);

      expect(TaxCategory.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array)
      );
    });
  });

  describe('getTaxCategory', () => {
    it('should return a single tax category details with sync info', async () => {
      mockRequest.params = { id: '1' };

      const mockTaxCategory = {
        id: 1,
        lightspeed_tax_category_id: 'tax_cat_1',
        is_tax_inclusive: false,
        tax_1_name: 'HST',
        toJSON: function() { return this; }
      };

      const mockSync = {
        id: 12,
        entity_type: 'tax_category',
        lightspeed_id: 'tax_cat_1',
        local_id: 1,
        last_sync: new Date(),
        hash: 'uvw',
      };

      (TaxCategory.findByPk as jest.Mock).mockResolvedValue(mockTaxCategory);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue(mockSync);

      await getTaxCategory(mockRequest as Request, mockResponse as Response);

      expect(TaxCategory.findByPk).toHaveBeenCalledWith(1);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          id: 1,
          lightspeed_sync_info: expect.objectContaining({
            entity_map_id: 12,
            lightspeed_id: 'tax_cat_1',
          })
        })
      );
    });

    it('should return error for invalid tax category ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getTaxCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid tax category ID.');
    });

    it('should return error when tax category not found', async () => {
      mockRequest.params = { id: '99' };
      (TaxCategory.findByPk as jest.Mock).mockResolvedValue(null);

      await getTaxCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tax category not found.');
    });
  });
});
