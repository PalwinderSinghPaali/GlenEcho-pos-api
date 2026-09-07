import { Request, Response } from 'express';
import { getProductsStock } from './index';
import { Product, InventoryReservation, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Product Stock Controller (getProductsStock)', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      query: {},
    };

    mockResponse = {
      sendSuccess: jest.fn(),
      sendError: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Partial<Response>;

    Product.findAll = jest.fn();
    InventoryReservation.findAll = jest.fn();
    LightspeedEntityMap.findAll = jest.fn().mockResolvedValue([]);
    LightspeedEntityMap.findOne = jest.fn().mockResolvedValue(null);
    LightspeedService.getLiveQoh = jest.fn();
  });

  it('should return validation error if ids query param is missing', async () => {
    mockRequest.query = {};

    await getProductsStock(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.sendError).toHaveBeenCalledWith(
      mockResponse,
      'ERR_VALIDATION_FAILED',
      expect.objectContaining({ error: expect.stringContaining('Missing required query parameter "ids"') })
    );
  });

  it('should return validation error if no valid numeric IDs are provided', async () => {
    mockRequest.query = { ids: 'abc,xyz,-1' };

    await getProductsStock(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.sendError).toHaveBeenCalledWith(
      mockResponse,
      'ERR_VALIDATION_FAILED',
      expect.objectContaining({ error: expect.stringContaining('No valid numeric product IDs') })
    );
  });

  it('should return complete product details directly with live POS stock and reservations deducted', async () => {
    mockRequest.query = { ids: '1,2,3' };

    const mockProducts = [
      {
        id: 1,
        description: 'Rose Bush',
        price: 29.99,
        lightspeed_item_id: '1001',
        qoh: 2, // cached DB qoh
        archived: false,
      },
      {
        id: 2,
        description: 'Tulip Bulb',
        price: 14.5,
        lightspeed_item_id: '1002',
        qoh: 1, // cached DB qoh
        archived: false,
      },
      {
        id: 3,
        description: 'Fern Pot',
        price: 19.0,
        lightspeed_item_id: '1003',
        qoh: 99, // cached DB says 99, but live POS says 0 (sold out in store)
        archived: false,
      },
    ];

    (Product.findAll as jest.Mock).mockResolvedValue(mockProducts);

    // Live POS stock mocks
    (LightspeedService.getLiveQoh as jest.Mock).mockImplementation(async (lsItemId: string) => {
      if (lsItemId === '1001') return 10; // 10 in live POS
      if (lsItemId === '1002') return 5;  // 5 in live POS
      if (lsItemId === '1003') return 0;  // 0 in live POS (sold out)
      return 0;
    });

    // Active unexpired reservations in checkout
    (InventoryReservation.findAll as jest.Mock).mockResolvedValue([
      { product_id: 2, total_reserved: 3 }, // 3 reserved for product 2
    ]);

    await getProductsStock(mockRequest as Request, mockResponse as Response);

    expect(LightspeedService.getLiveQoh).toHaveBeenCalledWith('1001', 1);
    expect(LightspeedService.getLiveQoh).toHaveBeenCalledWith('1002', 1);
    expect(LightspeedService.getLiveQoh).toHaveBeenCalledWith('1003', 1);

    expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
      mockResponse,
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          productId: 1,
          description: 'Rose Bush',
          price: 29.99,
          stockQty: 10, // 10 live - 0 reserved = 10
          qoh: 10,
          inStock: true,
        }),
        expect.objectContaining({
          id: 2,
          productId: 2,
          description: 'Tulip Bulb',
          price: 14.5,
          stockQty: 2, // 5 live - 3 reserved = 2
          qoh: 2,
          inStock: true,
        }),
        expect.objectContaining({
          id: 3,
          productId: 3,
          description: 'Fern Pot',
          price: 19.0,
          stockQty: 0, // 0 live in POS -> 0 available (does NOT fallback to cached DB qoh)
          qoh: 0,
          inStock: false,
        }),
      ])
    );
  });

  it('should handle archived and non-existent products as out of stock', async () => {
    mockRequest.query = { ids: '10,99' };

    const mockProducts = [
      {
        id: 10,
        description: 'Archived Plant',
        lightspeed_item_id: '1010',
        qoh: 8,
        archived: true, // archived product
      },
      // ID 99 does not exist in DB
    ];

    (Product.findAll as jest.Mock).mockResolvedValue(mockProducts);
    (InventoryReservation.findAll as jest.Mock).mockResolvedValue([]);

    await getProductsStock(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
      mockResponse,
      expect.arrayContaining([
        expect.objectContaining({
          id: 10,
          productId: 10,
          description: 'Archived Plant',
          stockQty: 0,
          inStock: false,
        }),
        expect.objectContaining({
          id: 99,
          productId: 99,
          stockQty: 0,
          inStock: false,
        }),
      ])
    );
  });

  it('should fall back to local stock for non-Lightspeed products without lightspeed_item_id', async () => {
    mockRequest.query = { ids: '5' };

    const mockProducts = [
      {
        id: 5,
        description: 'Handmade Planter',
        lightspeed_item_id: null,
        qoh: 7,
        archived: false,
        inventories: [{ qoh: 7, shop_id: 1 }],
      },
    ];

    (Product.findAll as jest.Mock).mockResolvedValue(mockProducts);
    (InventoryReservation.findAll as jest.Mock).mockResolvedValue([]);

    await getProductsStock(mockRequest as Request, mockResponse as Response);

    expect(LightspeedService.getLiveQoh).not.toHaveBeenCalled();
    expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
      mockResponse,
      expect.arrayContaining([
        expect.objectContaining({
          id: 5,
          productId: 5,
          description: 'Handmade Planter',
          stockQty: 7,
          inStock: true,
        }),
      ])
    );
  });
});
