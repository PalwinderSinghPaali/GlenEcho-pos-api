import { Request, Response } from 'express';
import { getInventories, getInventory, updateInventory } from './index';
import { ProductInventory } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Inventory Controllers', () => {
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

  describe('getInventories', () => {
    it('should return all inventory records without pagination by default', async () => {
      const mockRows = [
        {
          id: 1,
          qoh: 10,
          unit_cost: 5.5,
          reorder_point: 2,
          reorder_level: 5,
          lightspeed_item_shop_id: '12345',
          total_value: 55.0,
          total_sale_value: 100.0,
          special_order: 0,
          createdAt: new Date('2026-07-20T00:00:00Z'),
          updatedAt: new Date('2026-07-21T00:00:00Z'),
          toJSON: function() { return this; }
        },
      ];

      (ProductInventory.findAll as jest.Mock).mockResolvedValue(mockRows);

      await getInventories(mockRequest as Request, mockResponse as Response);

      expect(ProductInventory.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            qoh: 10,
            unitCost: 5.5,
            reorderPoint: 2,
            reorderLevel: 5,
            lightspeedItemShopID: '12345',
          }),
        ])
      );
    });

    it('should return paginated inventory records when pagination is true', async () => {
      mockRequest.query = { pagination: 'true', page: '1', limit: '10' };

      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            qoh: 10,
            unit_cost: 5.5,
            reorder_point: 2,
            reorder_level: 5,
            lightspeed_item_shop_id: '12345',
            total_value: 55.0,
            total_sale_value: 100.0,
            special_order: 0,
            createdAt: new Date('2026-07-20T00:00:00Z'),
            updatedAt: new Date('2026-07-21T00:00:00Z'),
            toJSON: function() { return this; }
          },
        ],
      };

      (ProductInventory.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getInventories(mockRequest as Request, mockResponse as Response);

      expect(ProductInventory.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          offset: 0,
          limit: 10,
        })
      );
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should apply filters for shopId and productId', async () => {
      mockRequest.query = { shopId: '2', productId: '3' };

      (ProductInventory.findAll as jest.Mock).mockResolvedValue([]);

      await getInventories(mockRequest as Request, mockResponse as Response);

      expect(ProductInventory.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            shop_id: 2,
            product_id: 3,
          },
        })
      );
    });

    it('should handle errors gracefully', async () => {
      (ProductInventory.findAll as jest.Mock).mockRejectedValue(new Error('DB Error'));

      await getInventories(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'DB Error');
    });
  });

  describe('getInventory', () => {
    it('should return a single inventory record details', async () => {
      mockRequest.params = { id: '1' };

      const mockRecord = {
        id: 1,
        qoh: 10,
        unit_cost: 5.5,
        reorder_point: 2,
        reorder_level: 5,
        lightspeed_item_shop_id: '12345',
        toJSON: function() { return this; }
      };

      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(mockRecord);

      await getInventory(mockRequest as Request, mockResponse as Response);

      expect(ProductInventory.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ id: 1 })
      );
    });

    it('should return error for invalid inventory ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getInventory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid inventory ID.');
    });

    it('should return error when inventory record not found', async () => {
      mockRequest.params = { id: '99' };
      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(null);

      await getInventory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Inventory record not found.');
    });
  });

  describe('updateInventory', () => {
    it('should return error for invalid inventory ID', async () => {
      mockRequest.params = { id: 'abc' };
      await updateInventory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid inventory ID.');
    });

    it('should return error when inventory record not found', async () => {
      mockRequest.params = { id: '999' };
      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(null);
      await updateInventory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Inventory record not found.');
    });

    it('should return error if no valid fields are provided to update', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = {};

      const mockInventory = {
        id: 1,
        reorder_point: 2,
        reorder_level: 5,
      };
      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(mockInventory);

      await updateInventory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'Only reorder_point and reorder_level can be updated on ItemShop.'
      );
    });

    it('should return error if fields to update are invalid numbers', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { reorder_point: 'abc' };

      const mockInventory = {
        id: 1,
        reorder_point: 2,
        reorder_level: 5,
      };
      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(mockInventory);

      await updateInventory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'reorder_point and reorder_level must be valid numbers.'
      );
    });

    it('should return error if qoh is provided in body', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { qoh: 25 };

      const mockInventory = {
        id: 1,
        reorder_point: 2,
        reorder_level: 5,
      };
      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(mockInventory);

      await updateInventory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'QOH cannot be updated directly via ItemShop inventory endpoint. Only reorder_point and reorder_level are supported as per Lightspeed documentation.'
      );
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { reorder_point: '5', reorder_level: '10' };

      const mockInventory = {
        id: 1,
        qoh: 10,
        unit_cost: 5.5,
        reorder_point: 2,
        reorder_level: 5,
        lightspeed_item_shop_id: '12345',
        update: jest.fn(),
        toJSON: function () {
          return this;
        },
      };

      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(mockInventory);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      await updateInventory(mockRequest as Request, mockResponse as Response);

      expect(mockInventory.update).not.toHaveBeenCalled();
      expect(LightspeedService.updateItemShop).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
        })
      );
    });

    it('should update ItemShop in Lightspeed POS and local DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { reorder_point: 5, reorder_level: 10 };

      const mockInventory = {
        id: 1,
        qoh: 10,
        unit_cost: 5.5,
        reorder_point: 2,
        reorder_level: 5,
        lightspeed_item_shop_id: '12345',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };

      (ProductInventory.findByPk as jest.Mock).mockResolvedValue(mockInventory);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateItemShop as jest.Mock).mockResolvedValue({});

      await updateInventory(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateItemShop).toHaveBeenCalledWith('12345', {
        reorderPoint: '5',
        reorderLevel: '10',
      });
      expect(mockInventory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reorder_point: 5,
          reorder_level: 10,
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Inventory record updated successfully in Lightspeed POS and local database.',
        })
      );
    });
  });
});
