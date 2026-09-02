import { Request, Response } from 'express';
import { getBrands, getBrand, createBrand, updateBrand } from './index';
import { Brand, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Brand Controllers', () => {
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

  describe('getBrands', () => {
    it('should return paginated brands with productCount when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_brand_id: '100',
            name: 'Willowbrook',
            createdAt: new Date(),
            updatedAt: new Date(),
            toJSON: function() {
              return {
                id: 1,
                lightspeed_brand_id: '100',
                name: 'Willowbrook',
                productCount: 15,
              };
            }
          },
        ],
      };

      (Brand.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getBrands(mockRequest as Request, mockResponse as Response);

      expect(Brand.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({
            id: 1,
            manufacturerID: 100,
            productCount: 15,
          })
        ]),
        1
      );
    });

    it('should return all brands with productCount when pagination is not true', async () => {
      const mockResult = [
        {
          id: 2,
          lightspeed_brand_id: '101',
          name: 'Eshragi',
          createdAt: new Date(),
          updatedAt: new Date(),
          toJSON: function() {
            return {
              id: 2,
              lightspeed_brand_id: '101',
              name: 'Eshragi',
              productCount: 0,
            };
          }
        },
      ];

      (Brand.findAll as jest.Mock).mockResolvedValue(mockResult);

      await getBrands(mockRequest as Request, mockResponse as Response);

      expect(Brand.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({
            id: 2,
            manufacturerID: 101,
            productCount: 0,
          })
        ])
      );
    });
  });

  describe('getBrand', () => {
    it('should return a single brand details with sync metadata', async () => {
      mockRequest.params = { id: '1' };

      const mockBrand = {
        id: 1,
        lightspeed_brand_id: '100',
        name: 'Willowbrook',
        createdAt: new Date(),
        updatedAt: new Date(),
        toJSON: function() {
          return {
            id: 1,
            lightspeed_brand_id: '100',
            name: 'Willowbrook',
          };
        }
      };

      const mockSync = {
        id: 50,
        entity_type: 'brand',
        lightspeed_id: '100',
        local_id: 1,
        last_sync: new Date(),
        hash: 'abc123hash',
      };

      (Brand.findByPk as jest.Mock).mockResolvedValue(mockBrand);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue(mockSync);

      await getBrand(mockRequest as Request, mockResponse as Response);

      expect(Brand.findByPk).toHaveBeenCalledWith(1);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          id: 1,
          manufacturerID: 100,
          lightspeed_sync_info: expect.objectContaining({
            entity_map_id: 50,
            lightspeed_id: '100',
          }),
        })
      );
    });

    it('should return error for invalid brand ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getBrand(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid brand ID.');
    });

    it('should return error if brand not found', async () => {
      mockRequest.params = { id: '999' };
      (Brand.findByPk as jest.Mock).mockResolvedValue(null);

      await getBrand(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Brand not found.');
    });
  });

  describe('createBrand', () => {
    it('should return error if name is missing', async () => {
      mockRequest.body = {};
      await createBrand(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Brand name is required.');
    });

    it('should return error if brand with same name already exists', async () => {
      mockRequest.body = { name: 'Existing Brand' };
      (Brand.findOne as jest.Mock).mockResolvedValue({ id: 5, name: 'Existing Brand' });

      await createBrand(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        "Brand with name 'Existing Brand' already exists."
      );
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.body = { name: 'Test Brand' };
      (Brand.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await createBrand(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.createManufacturer).not.toHaveBeenCalled();
      expect(Brand.create).not.toHaveBeenCalled();
      expect(LightspeedEntityMap.upsert).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: { name: 'Test Brand' },
        }),
        200
      );

      consoleSpy.mockRestore();
    });

    it('should write to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.body = { name: 'Live Brand' };
      (Brand.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createManufacturer as jest.Mock).mockResolvedValue({
        Manufacturer: {
          manufacturerID: '200',
          name: 'Live Brand',
        },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        {
          manufacturerID: '200',
          name: 'Live Brand',
        },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashbrand');

      const mockCreatedBrand = {
        id: 12,
        name: 'Live Brand',
        lightspeed_brand_id: '200',
        toJSON: () => ({
          id: 12,
          name: 'Live Brand',
          lightspeed_brand_id: '200',
        }),
      };
      (Brand.create as jest.Mock).mockResolvedValue(mockCreatedBrand);
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await createBrand(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createManufacturer).toHaveBeenCalledWith({ name: 'Live Brand' });
      expect(Brand.create).toHaveBeenCalledWith({
        name: 'Live Brand',
        lightspeed_brand_id: '200',
      });
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'brand',
          lightspeed_id: '200',
          local_id: 12,
          hash: 'mockhashbrand',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('successfully in Lightspeed and local database'),
        }),
        201
      );
    });
  });

  describe('updateBrand', () => {
    it('should return error for invalid brand ID', async () => {
      mockRequest.params = { id: 'invalid' };
      await updateBrand(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid brand ID.');
    });

    it('should return error if brand not found', async () => {
      mockRequest.params = { id: '999' };
      (Brand.findByPk as jest.Mock).mockResolvedValue(null);

      await updateBrand(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Brand not found.');
    });

    it('should return error if name is empty string', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: '   ' };
      (Brand.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Current Brand' });

      await updateBrand(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Brand name cannot be empty.');
    });

    it('should return error if duplicate brand name already exists', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Existing Brand' };
      (Brand.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Current Brand' });
      (Brand.findOne as jest.Mock).mockResolvedValue({ id: 2, name: 'Existing Brand' });

      await updateBrand(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        "Another brand with name 'Existing Brand' already exists."
      );
    });

    it('should only show payload in console and not update in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Brand' };
      const mockBrand = {
        id: 1,
        lightspeed_brand_id: '200',
        name: 'Old Brand',
        update: jest.fn(),
      };
      (Brand.findByPk as jest.Mock).mockResolvedValue(mockBrand);
      (Brand.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateBrand(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.updateManufacturer).not.toHaveBeenCalled();
      expect(mockBrand.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: { name: 'Updated Brand' },
        })
      );

      consoleSpy.mockRestore();
    });

    it('should update in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Brand Live' };
      const mockBrand = {
        id: 1,
        lightspeed_brand_id: '200',
        name: 'Old Brand',
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_brand_id: '200',
          name: 'Updated Brand Live',
        }),
      };
      (Brand.findByPk as jest.Mock).mockResolvedValue(mockBrand);
      (Brand.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateManufacturer as jest.Mock).mockResolvedValue({});
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashupdate');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateBrand(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateManufacturer).toHaveBeenCalledWith('200', { name: 'Updated Brand Live' });
      expect(mockBrand.update).toHaveBeenCalledWith({
        name: 'Updated Brand Live',
        lightspeed_brand_id: '200',
      });
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'brand',
          lightspeed_id: '200',
          local_id: 1,
          hash: 'mockhashupdate',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('successfully in Lightspeed and local database'),
        })
      );
    });

    it('should create in POS if brand only has a local ID', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Brand Promoted To Live' };
      const mockBrand = {
        id: 1,
        lightspeed_brand_id: 'local_123456',
        name: 'Brand Local',
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_brand_id: '300',
          name: 'Brand Promoted To Live',
        }),
      };
      (Brand.findByPk as jest.Mock).mockResolvedValue(mockBrand);
      (Brand.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createManufacturer as jest.Mock).mockResolvedValue({
        Manufacturer: { manufacturerID: '300', name: 'Brand Promoted To Live' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { manufacturerID: '300', name: 'Brand Promoted To Live' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashlocal');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateBrand(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createManufacturer).toHaveBeenCalledWith({ name: 'Brand Promoted To Live' });
      expect(mockBrand.update).toHaveBeenCalledWith({
        name: 'Brand Promoted To Live',
        lightspeed_brand_id: '300',
      });
    });
  });
});
