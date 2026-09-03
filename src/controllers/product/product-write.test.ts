jest.mock('@/config', () => ({
  __esModule: true,
  default: {
    app: { prefix: '/api', version: 'v1' },
    lightspeed: { apiUrl: 'https://api.lightspeedapp.com/API/V3' },
    db: {
      readHosts: [],
      writeHost: 'localhost',
      port: 5432,
      database: 'test_db',
      username: 'test_user',
      password: 'test_password',
      pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
    },
  },
}));

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');

import { Request, Response } from 'express';
import sequelize from '@/database/connection';
import {
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImages,
  deleteProductImage,
} from './index';
import {
  Product,
  Brand,
  Category,
  ProductMatrix,
  ProductImage,
  ProductInventory,
  ProductVendor,
  ProductTag,
  Tag,
  Shop,
  LightspeedEntityMap,
} from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';
import fs from 'fs';

describe('Product Write Controllers', () => {
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

    Product.findByPk = jest.fn();
    Product.create = jest.fn();
    Product.update = jest.fn();
    Brand.findByPk = jest.fn();
    Category.findByPk = jest.fn();
    ProductMatrix.findByPk = jest.fn();
    ProductImage.count = jest.fn();
    ProductImage.create = jest.fn();
    ProductImage.findOne = jest.fn();
    ProductImage.destroy = jest.fn();
    ProductInventory.create = jest.fn();
    ProductInventory.findOne = jest.fn();
    ProductInventory.findOrCreate = jest.fn();
    ProductInventory.destroy = jest.fn();
    ProductVendor.destroy = jest.fn();
    ProductTag.destroy = jest.fn();
    ProductTag.bulkCreate = jest.fn();
    Tag.findAll = jest.fn();
    Tag.findOrCreate = jest.fn();
    Shop.findOne = jest.fn();
    LightspeedEntityMap.findOne = jest.fn();
    LightspeedEntityMap.create = jest.fn();
    LightspeedEntityMap.upsert = jest.fn();
    LightspeedEntityMap.destroy = jest.fn();

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'mkdirSync').mockReturnValue(undefined as any);
    jest.spyOn(fs, 'writeFileSync').mockReturnValue(undefined);

    const mockTx = {
      commit: jest.fn().mockResolvedValue(true),
      rollback: jest.fn().mockResolvedValue(true),
    };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(mockTx as any);

    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should return error if description is missing', async () => {
      mockRequest.body = {};
      await createProduct(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'Product description is required.'
      );
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.body = {
        description: 'Oak Tree',
        price: 99.99,
        brand_id: 2,
        category_id: 5,
      };

      (Brand.findByPk as jest.Mock).mockResolvedValue({ id: 2, lightspeed_brand_id: '12' });
      (Category.findByPk as jest.Mock).mockResolvedValue({ id: 5, lightspeed_category_id: '45' });
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await createProduct(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.createProduct).not.toHaveBeenCalled();
      expect(Product.create).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            description: 'Oak Tree',
            manufacturerID: '12',
            categoryID: '45',
          }),
        }),
        200
      );

      consoleSpy.mockRestore();
    });

    it('should write to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.body = {
        description: 'Maple Tree',
        price: 120.0,
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createProduct as jest.Mock).mockResolvedValue({
        Item: { itemID: '401', systemSku: '210000000401', description: 'Maple Tree' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { itemID: '401', systemSku: '210000000401', description: 'Maple Tree' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockproducthash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      const mockCreated = {
        id: 10,
        lightspeed_item_id: '401',
        system_sku: '210000000401',
        description: 'Maple Tree',
        price: 120.0,
        toJSON: () => ({
          id: 10,
          lightspeed_item_id: '401',
          system_sku: '210000000401',
          description: 'Maple Tree',
        }),
      };
      (Product.create as jest.Mock).mockResolvedValue(mockCreated);

      await createProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Maple Tree',
        })
      );
      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Maple Tree',
          lightspeed_item_id: '401',
          system_sku: '210000000401',
        }),
        expect.any(Object)
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'product',
          lightspeed_id: '401',
          local_id: 10,
          hash: 'mockproducthash',
        }),
        expect.any(Object)
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('successfully in Lightspeed and local database'),
        }),
        201
      );
    });

    it('should include taxClassID and Tags in payload and DB when provided on create', async () => {
      mockRequest.body = {
        description: 'Rose Bush',
        price: 35.0,
        tax_class_id: 1,
        tags: ['Outdoor', 'Perennial'],
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createProduct as jest.Mock).mockResolvedValue({
        Item: { itemID: '405', systemSku: '210000000405', description: 'Rose Bush' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { itemID: '405', systemSku: '210000000405', description: 'Rose Bush' },
      ]);
      (Tag.findOrCreate as jest.Mock)
        .mockResolvedValueOnce([{ id: 101, name: 'Outdoor' }])
        .mockResolvedValueOnce([{ id: 102, name: 'Perennial' }]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhash');

      const mockCreated = {
        id: 20,
        lightspeed_item_id: '405',
        description: 'Rose Bush',
        price: 35.0,
        tax_class_id: '1',
        qoh: 0,
        toJSON: () => ({ id: 20, lightspeed_item_id: '405', description: 'Rose Bush' }),
      };
      (Product.create as jest.Mock).mockResolvedValue(mockCreated);

      await createProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          taxClassID: '1',
          description: 'Rose Bush',
        })
      );
      expect(ProductTag.bulkCreate).toHaveBeenCalledWith(
        [
          { product_id: 20, tag_id: 101 },
          { product_id: 20, tag_id: 102 },
        ],
        expect.any(Object)
      );
    });

    it('should push initial stock to Lightspeed via updateItemQOH and persist in Product and ProductInventory', async () => {
      mockRequest.body = {
        description: 'Fern Plant',
        price: 25.0,
        qoh: 30,
        Note: 'Handle with care',
        displayNote: true,
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createProduct as jest.Mock).mockResolvedValue({
        Item: {
          itemID: '555',
          systemSku: '210000000555',
          description: 'Fern Plant',
          ItemShops: {
            ItemShop: [
              { itemShopID: '15', shopID: '0', qoh: '0' },
              { itemShopID: '777', shopID: '1', qoh: '0' },
            ],
          },
        },
      });
      (LightspeedService.extractList as jest.Mock).mockImplementation((obj, key) => {
        if (key === 'Item') return [obj.Item || obj];
        if (key === 'ItemShop') return Array.isArray(obj.ItemShop) ? obj.ItemShop : [obj.ItemShop];
        return [];
      });
      (LightspeedService.updateItemQOH as jest.Mock) = jest.fn().mockResolvedValue({});
      (Shop.findOne as jest.Mock).mockResolvedValue({ id: 1, lightspeed_shop_id: '1' });
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockfernproducthash');

      const mockCreated = {
        id: 30,
        lightspeed_item_id: '555',
        description: 'Fern Plant',
        price: 25.0,
        qoh: 30,
        note: 'Handle with care',
        display_note: true,
        toJSON: () => ({ id: 30, lightspeed_item_id: '555', description: 'Fern Plant' }),
      };
      (Product.create as jest.Mock).mockResolvedValue(mockCreated);

      await createProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Fern Plant',
          note: 'Handle with care',
          displayNote: 'true',
          Note: {
            note: 'Handle with care',
            isPublic: 'true',
          },
        })
      );
      expect(LightspeedService.updateItemQOH).toHaveBeenCalledWith(
        '555',
        expect.objectContaining({ itemShopID: '777', qoh: 30 })
      );
      expect(Product.create).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Fern Plant',
          note: 'Handle with care',
          display_note: true,
          qoh: 30,
        }),
        expect.any(Object)
      );
      expect(ProductInventory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: 30,
          shop_id: 1,
          qoh: 30,
          lightspeed_item_shop_id: '777',
        }),
        expect.any(Object)
      );
    });
  });

  describe('updateProduct', () => {
    it('should return error for invalid product ID', async () => {
      mockRequest.params = { id: 'abc' };
      await updateProduct(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid product ID.');
    });

    it('should return error if product not found', async () => {
      mockRequest.params = { id: '999' };
      (Product.findByPk as jest.Mock).mockResolvedValue(null);

      await updateProduct(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Product not found.');
    });

    it('should return error if description is empty string', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { description: '   ' };
      (Product.findByPk as jest.Mock).mockResolvedValue({ id: 1, description: 'Old' });

      await updateProduct(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'Product description cannot be empty.'
      );
    });

    it('should only show payload in console and not update in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { description: 'Updated Maple' };
      const mockProduct = {
        id: 1,
        lightspeed_item_id: '401',
        description: 'Old Maple',
        update: jest.fn(),
      };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.updateProduct).not.toHaveBeenCalled();
      expect(mockProduct.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            description: 'Updated Maple',
          }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should update in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { description: 'Updated Maple Live' };
      const mockProduct = {
        id: 1,
        lightspeed_item_id: '401',
        system_sku: '210000000401',
        description: 'Old Maple',
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_item_id: '401',
          description: 'Updated Maple Live',
        }),
      };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateProduct as jest.Mock).mockResolvedValue({});
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockupdatehash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateProduct).toHaveBeenCalledWith(
        '401',
        expect.objectContaining({
          description: 'Updated Maple Live',
        })
      );
      expect(mockProduct.update).toHaveBeenCalled();
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'product',
          lightspeed_id: '401',
          local_id: 1,
          hash: 'mockupdatehash',
        }),
        expect.any(Object)
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('successfully in Lightspeed and local database'),
        })
      );
    });

    it('should create in POS if product only has a local ID', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { description: 'Promoted Plant' };
      const mockProduct = {
        id: 1,
        lightspeed_item_id: 'local_item_1234',
        system_sku: null,
        description: 'Local Plant',
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_item_id: '502',
          description: 'Promoted Plant',
        }),
      };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createProduct as jest.Mock).mockResolvedValue({
        Item: { itemID: '502', systemSku: '210000000502', description: 'Promoted Plant' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { itemID: '502', systemSku: '210000000502', description: 'Promoted Plant' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockpromotedhash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createProduct).toHaveBeenCalled();
      expect(mockProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          lightspeed_item_id: '502',
          description: 'Promoted Plant',
        }),
        expect.any(Object)
      );
    });

    it('should update taxClassID and Tags in payload and DB when provided on update', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = {
        tax_class_id: 2,
        tags: ['Indoor'],
      };

      const mockProduct = {
        id: 1,
        lightspeed_item_id: '401',
        description: 'Plant',
        price: 20.0,
        tax_class_id: '1',
        qoh: 10,
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({ id: 1, lightspeed_item_id: '401', description: 'Plant' }),
      };

      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateProduct as jest.Mock).mockResolvedValue({});
      (Tag.findOrCreate as jest.Mock).mockResolvedValueOnce([{ id: 201, name: 'Indoor' }]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhash2');

      await updateProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateProduct).toHaveBeenCalledWith(
        '401',
        expect.objectContaining({
          taxClassID: '2',
        })
      );
      expect(mockProduct.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tax_class_id: '2',
        }),
        expect.any(Object)
      );
      expect(ProductTag.destroy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { product_id: 1 } }),
      );
      expect(ProductTag.bulkCreate).toHaveBeenCalledWith(
        [{ product_id: 1, tag_id: 201 }],
        expect.any(Object)
      );
    });
  });

  describe('deleteProduct', () => {
    it('should return error for invalid product ID', async () => {
      mockRequest.params = { id: 'abc' };
      await deleteProduct(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid product ID.');
    });

    it('should return error if product not found', async () => {
      mockRequest.params = { id: '999' };
      (Product.findByPk as jest.Mock).mockResolvedValue(null);

      await deleteProduct(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Product not found.');
    });

    it('should only show payload in console and not delete in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      const mockProduct = {
        id: 1,
        lightspeed_item_id: '401',
        description: 'Plant To Archive',
        destroy: jest.fn(),
      };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await deleteProduct(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.archiveProduct).not.toHaveBeenCalled();
      expect(mockProduct.destroy).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          itemID: '401',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should archive in Lightspeed POS and delete locally when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      const mockProduct = {
        id: 1,
        lightspeed_item_id: '401',
        description: 'Plant To Archive',
        destroy: jest.fn().mockResolvedValue(true),
      };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.archiveProduct as jest.Mock).mockResolvedValue({});

      await deleteProduct(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.archiveProduct).toHaveBeenCalledWith('401');
      expect(ProductInventory.destroy).toHaveBeenCalled();
      expect(ProductVendor.destroy).toHaveBeenCalled();
      expect(ProductTag.destroy).toHaveBeenCalled();
      expect(ProductImage.destroy).toHaveBeenCalled();
      expect(mockProduct.destroy).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('deleted successfully from Lightspeed and local database'),
        })
      );
    });
  });

  describe('uploadProductImages', () => {
    it('should return error for invalid product ID', async () => {
      mockRequest.params = { id: 'abc' };
      await uploadProductImages(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid product ID.');
    });

    it('should return error if product not found', async () => {
      mockRequest.params = { id: '999' };
      (Product.findByPk as jest.Mock).mockResolvedValue(null);

      await uploadProductImages(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Product not found.');
    });

    it('should return error if no files uploaded', async () => {
      mockRequest.params = { id: '1' };
      (Product.findByPk as jest.Mock).mockResolvedValue({ id: 1, lightspeed_item_id: '401' });
      mockRequest.files = [];

      await uploadProductImages(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'No image files uploaded.');
    });

    it('should only show payload in console and not upload when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      const mockProduct = { id: 1, lightspeed_item_id: '401' };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (ProductImage.count as jest.Mock).mockResolvedValue(0);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      mockRequest.files = [
        {
          originalname: 'tree.jpg',
          size: 1024,
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake'),
        } as Express.Multer.File,
      ];

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await uploadProductImages(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.uploadItemImage).not.toHaveBeenCalled();
      expect(ProductImage.create).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            productID: '401',
          }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should upload to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      const mockProduct = { id: 1, lightspeed_item_id: '401' };
      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (ProductImage.count as jest.Mock).mockResolvedValue(0);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);

      (LightspeedService.uploadItemImage as jest.Mock).mockResolvedValue({
        Image: {
          imageID: '901',
          baseImageURL: 'https://res.cloudinary.com/lightspeed/image/upload/',
          publicID: 'img_test_1',
          filename: 'tree.jpg',
        },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        {
          imageID: '901',
          baseImageURL: 'https://res.cloudinary.com/lightspeed/image/upload/',
          publicID: 'img_test_1',
          filename: 'tree.jpg',
        },
      ]);

      (ProductImage.create as jest.Mock).mockResolvedValue({
        id: 1,
        lightspeed_image_id: '901',
        lightspeed_url: 'https://res.cloudinary.com/lightspeed/image/upload/img_test_1.jpg',
      });

      mockRequest.files = [
        {
          originalname: 'tree.jpg',
          size: 1024,
          mimetype: 'image/jpeg',
          buffer: Buffer.from('fake'),
        } as Express.Multer.File,
      ];

      await uploadProductImages(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.uploadItemImage).toHaveBeenCalledWith(
        '401',
        expect.any(Buffer),
        'tree.jpg',
        'image/jpeg',
        expect.objectContaining({ description: 'tree.jpg', ordering: 0 })
      );
      expect(ProductImage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          lightspeed_image_id: '901',
          lightspeed_url: 'https://res.cloudinary.com/lightspeed/image/upload/img_test_1.jpg',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('successfully to Lightspeed and local database'),
        })
      );
    });
  });

  describe('deleteProductImage', () => {
    it('should return error for invalid product ID', async () => {
      mockRequest.params = { id: 'abc', imageId: '1' };
      await deleteProductImage(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid product ID.');
    });

    it('should return error if product not found', async () => {
      mockRequest.params = { id: '999', imageId: '1' };
      (Product.findByPk as jest.Mock).mockResolvedValue(null);

      await deleteProductImage(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Product not found.');
    });

    it('should return error if product image not found', async () => {
      mockRequest.params = { id: '1', imageId: '999' };
      (Product.findByPk as jest.Mock).mockResolvedValue({ id: 1, lightspeed_item_id: '401' });
      (ProductImage.findOne as jest.Mock).mockResolvedValue(null);

      await deleteProductImage(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Product image not found.');
    });

    it('should only show payload in console and not delete in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1', imageId: '5' };
      (Product.findByPk as jest.Mock).mockResolvedValue({ id: 1, lightspeed_item_id: '401' });
      (ProductImage.findOne as jest.Mock).mockResolvedValue({
        id: 5,
        product_id: 1,
        lightspeed_image_id: '999',
        filename: 'flower.jpg',
        destroy: jest.fn(),
      });
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      await deleteProductImage(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.deleteItemImage).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
        })
      );
    });

    it('should delete image in Lightspeed POS and local DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1', imageId: '5' };
      const mockProduct = { id: 1, lightspeed_item_id: '401' };
      const mockImage = {
        id: 5,
        product_id: 1,
        lightspeed_image_id: '999',
        filename: 'flower.jpg',
        local_path: '/api/v1/lightspeed/images/flower.jpg',
        is_featured: false,
        destroy: jest.fn().mockResolvedValue(true),
      };

      (Product.findByPk as jest.Mock).mockResolvedValue(mockProduct);
      (ProductImage.findOne as jest.Mock).mockResolvedValue(mockImage);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.deleteItemImage as jest.Mock).mockResolvedValue({});

      await deleteProductImage(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.deleteItemImage).toHaveBeenCalledWith('999', '401');
      expect(mockImage.destroy).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('deleted successfully from Lightspeed and local database'),
          deletedImageId: 5,
          lightspeedImageId: '999',
        })
      );
    });
  });
});
