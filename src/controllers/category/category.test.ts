import { Request, Response } from 'express';
import {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  mergeCategoryInto,
} from './index';
import { Category, LightspeedEntityMap, Product } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Category Controllers', () => {
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
    Category.count = jest.fn();
    Product.count = jest.fn();
    Category.update = jest.fn();
    Product.update = jest.fn();
    Category.findByPk = jest.fn();
    Category.findAndCountAll = jest.fn();
    Category.findAll = jest.fn();
    Category.create = jest.fn();
    Category.upsert = jest.fn();
    jest.clearAllMocks();
  });

  describe('getCategories', () => {
    it('should return paginated categories when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_category_id: '10',
            name: 'Perennials',
            parent_id: null,
            node_depth: 0,
            full_path_name: 'Perennials',
            toJSON: function () {
              return {
                id: 1,
                lightspeed_category_id: '10',
                name: 'Perennials',
                parent_id: null,
                node_depth: 0,
                full_path_name: 'Perennials',
              };
            },
          },
        ],
      };
      (Category.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getCategories(mockRequest as Request, mockResponse as Response);

      expect(Category.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should return all categories when pagination is not true', async () => {
      mockRequest.query = {};
      const mockRows = [
        {
          id: 1,
          lightspeed_category_id: '10',
          name: 'Perennials',
          parent_id: null,
          node_depth: 0,
          full_path_name: 'Perennials',
          toJSON: function () {
            return {
              id: 1,
              lightspeed_category_id: '10',
              name: 'Perennials',
              parent_id: null,
              node_depth: 0,
              full_path_name: 'Perennials',
            };
          },
        },
      ];
      (Category.findAll as jest.Mock).mockResolvedValue(mockRows);

      await getCategories(mockRequest as Request, mockResponse as Response);

      expect(Category.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, expect.any(Array));
    });
  });

  describe('getCategory', () => {
    it('should return error for invalid category ID', async () => {
      mockRequest.params = { id: 'invalid' };
      await getCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid category ID.');
    });

    it('should return error if category not found', async () => {
      mockRequest.params = { id: '999' };
      (Category.findByPk as jest.Mock).mockResolvedValue(null);

      await getCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Category not found.');
    });

    it('should return a single category details with sync metadata', async () => {
      mockRequest.params = { id: '1' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: '10',
        name: 'Perennials',
        parent_id: null,
        node_depth: 0,
        full_path_name: 'Perennials',
        parent: null,
        subcategories: [],
        toJSON: function () {
          return {
            id: 1,
            lightspeed_category_id: '10',
            name: 'Perennials',
            parent_id: null,
            node_depth: 0,
            full_path_name: 'Perennials',
            parent: null,
            subcategories: [],
          };
        },
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue({
        id: 5,
        lightspeed_id: '10',
        local_id: 1,
        last_sync: new Date(),
        hash: 'testcathash',
      });

      await getCategory(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          id: 1,
          name: 'Perennials',
          lightspeed_sync_info: expect.objectContaining({
            lightspeed_id: '10',
            hash: 'testcathash',
          }),
        })
      );
    });
  });

  describe('createCategory', () => {
    it('should return error if name is missing', async () => {
      mockRequest.body = {};
      await createCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Category name is required.');
    });

    it('should return error if parent category does not exist', async () => {
      mockRequest.body = { name: 'Roses', parent_id: 888 };
      (Category.findByPk as jest.Mock).mockResolvedValue(null);

      await createCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'Parent category with ID 888 not found.'
      );
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.body = { name: 'Shrubs' };
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.createCategory).not.toHaveBeenCalled();
      expect(Category.create).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({ name: 'Shrubs' }),
        }),
        200
      );

      consoleSpy.mockRestore();
    });

    it('should write to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.body = { name: 'Shrubs Live' };
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createCategory as jest.Mock).mockResolvedValue({
        Category: {
          categoryID: '55',
          name: 'Shrubs Live',
          nodeDepth: '0',
          fullPathName: 'Shrubs Live',
        },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        {
          categoryID: '55',
          name: 'Shrubs Live',
          nodeDepth: '0',
          fullPathName: 'Shrubs Live',
        },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockcathash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      const mockCreatedCategory = {
        id: 12,
        lightspeed_category_id: '55',
        name: 'Shrubs Live',
        parent_id: null,
        node_depth: 0,
        full_path_name: 'Shrubs Live',
        toJSON: () => ({
          id: 12,
          lightspeed_category_id: '55',
          name: 'Shrubs Live',
          parent_id: null,
          node_depth: 0,
          full_path_name: 'Shrubs Live',
        }),
      };
      (Category.create as jest.Mock).mockResolvedValue(mockCreatedCategory);

      await createCategory(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Shrubs Live' })
      );
      expect(Category.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Shrubs Live',
          lightspeed_category_id: '55',
        })
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'category',
          lightspeed_id: '55',
          local_id: 12,
          hash: 'mockcathash',
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

  describe('updateCategory', () => {
    it('should return error for invalid category ID', async () => {
      mockRequest.params = { id: 'invalid' };
      await updateCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid category ID.');
    });

    it('should return error if category not found', async () => {
      mockRequest.params = { id: '999' };
      (Category.findByPk as jest.Mock).mockResolvedValue(null);

      await updateCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Category not found.');
    });

    it('should return error if name is empty string', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: '   ' };
      (Category.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Old' });

      await updateCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Category name cannot be empty.');
    });

    it('should return error if setting self as parent', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { parent_id: 1 };
      (Category.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Root' });

      await updateCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'A category cannot be its own parent.'
      );
    });

    it('should only show payload in console and not update in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Shrub' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: '55',
        name: 'Old Shrub',
        parent_id: null,
        node_depth: 0,
        full_path_name: 'Old Shrub',
        update: jest.fn(),
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateCategory(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.updateCategory).not.toHaveBeenCalled();
      expect(mockCategory.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({ name: 'Updated Shrub' }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should update in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Shrub Live' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: '55',
        name: 'Old Shrub',
        parent_id: null,
        node_depth: 0,
        full_path_name: 'Old Shrub',
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_category_id: '55',
          name: 'Updated Shrub Live',
          parent_id: null,
          node_depth: 0,
          full_path_name: 'Updated Shrub Live',
        }),
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateCategory as jest.Mock).mockResolvedValue({});
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockupdatehash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateCategory(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateCategory).toHaveBeenCalledWith(
        '55',
        expect.objectContaining({ name: 'Updated Shrub Live' })
      );
      expect(mockCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Shrub Live',
          lightspeed_category_id: '55',
        })
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'category',
          lightspeed_id: '55',
          local_id: 1,
          hash: 'mockupdatehash',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('successfully in Lightspeed and local database'),
        })
      );
    });

    it('should create in POS if category only has a local ID', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Category Promoted' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: 'local_987654',
        name: 'Local Cat',
        parent_id: null,
        node_depth: 0,
        full_path_name: 'Local Cat',
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_category_id: '77',
          name: 'Category Promoted',
          parent_id: null,
          node_depth: 0,
          full_path_name: 'Category Promoted',
        }),
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createCategory as jest.Mock).mockResolvedValue({
        Category: { categoryID: '77', name: 'Category Promoted' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { categoryID: '77', name: 'Category Promoted' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockpromotedhash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateCategory(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createCategory).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Category Promoted' })
      );
      expect(mockCategory.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Category Promoted',
          lightspeed_category_id: '77',
        })
      );
    });
  });

  describe('deleteCategory', () => {
    it('should return error for invalid category ID', async () => {
      mockRequest.params = { id: 'abc' };
      await deleteCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid category ID.');
    });

    it('should return error if category not found', async () => {
      mockRequest.params = { id: '999' };
      (Category.findByPk as jest.Mock).mockResolvedValue(null);

      await deleteCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Category not found.');
    });

    it('should return error if child categories exist', async () => {
      mockRequest.params = { id: '1' };
      (Category.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Parent Category' });
      (Category.count as jest.Mock).mockResolvedValue(2);

      await deleteCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        expect.stringContaining("Cannot delete category 'Parent Category': it has 2 child categories")
      );
    });

    it('should return error if products are assigned and force is not true', async () => {
      mockRequest.params = { id: '1' };
      (Category.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Category In Use' });
      (Category.count as jest.Mock).mockResolvedValue(0);
      (Product.count as jest.Mock).mockResolvedValue(5);

      await deleteCategory(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        expect.stringContaining("Cannot delete category 'Category In Use': 5 products are assigned to it")
      );
    });

    it('should disassociate products when force=true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.query = { force: 'true' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: '55',
        name: 'Category In Use',
        destroy: jest.fn().mockResolvedValue(true),
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (Category.count as jest.Mock).mockResolvedValue(0);
      (Product.count as jest.Mock).mockResolvedValue(3);
      (Product.update as jest.Mock).mockResolvedValue([3]);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.deleteCategory as jest.Mock).mockResolvedValue({});
      (LightspeedEntityMap.destroy as jest.Mock).mockResolvedValue(1);

      await deleteCategory(mockRequest as Request, mockResponse as Response);

      expect(Product.update).toHaveBeenCalledWith({ category_id: null }, { where: { category_id: 1 } });
      expect(LightspeedService.deleteCategory).toHaveBeenCalledWith('55');
      expect(mockCategory.destroy).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          warning: '3 products were unassigned from this category.',
        })
      );
    });

    it('should only show payload in console and not delete in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: '55',
        name: 'Category To Delete',
        destroy: jest.fn(),
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (Category.count as jest.Mock).mockResolvedValue(0);
      (Product.count as jest.Mock).mockResolvedValue(0);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await deleteCategory(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.deleteCategory).not.toHaveBeenCalled();
      expect(mockCategory.destroy).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          categoryID: '55',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should delete in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      const mockCategory = {
        id: 1,
        lightspeed_category_id: '55',
        name: 'Category To Delete',
        destroy: jest.fn().mockResolvedValue(true),
      };
      (Category.findByPk as jest.Mock).mockResolvedValue(mockCategory);
      (Category.count as jest.Mock).mockResolvedValue(0);
      (Product.count as jest.Mock).mockResolvedValue(0);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.deleteCategory as jest.Mock).mockResolvedValue({});
      (LightspeedEntityMap.destroy as jest.Mock).mockResolvedValue(1);

      await deleteCategory(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.deleteCategory).toHaveBeenCalledWith('55');
      expect(mockCategory.destroy).toHaveBeenCalled();
      expect(LightspeedEntityMap.destroy).toHaveBeenCalledWith({
        where: {
          entity_type: 'category',
          lightspeed_id: '55',
        },
      });
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('deleted successfully from Lightspeed and local database'),
        })
      );
    });
  });

  describe('mergeCategoryInto', () => {
    it('should return error if source_id or target_id is missing', async () => {
      mockRequest.body = { source_id: 1 };
      await mergeCategoryInto(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'target_id is required.');
    });

    it('should return error if source_id equals target_id', async () => {
      mockRequest.body = { source_id: 1, target_id: 1 };
      await mergeCategoryInto(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'source_id and target_id must be different categories.'
      );
    });

    it('should return error if source or target category not found', async () => {
      mockRequest.body = { source_id: 1, target_id: 2 };
      (Category.findByPk as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2, name: 'Target' });

      await mergeCategoryInto(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        'Source category with ID 1 not found.'
      );
    });

    it('should only show payload in console and not perform merge when read-only mode is true', async () => {
      mockRequest.body = { source_id: 1, target_id: 2 };
      const mockSource = {
        id: 1,
        lightspeed_category_id: '10',
        name: 'Source Cat',
        destroy: jest.fn(),
      };
      const mockTarget = {
        id: 2,
        lightspeed_category_id: '20',
        name: 'Target Cat',
      };
      (Category.findByPk as jest.Mock)
        .mockResolvedValueOnce(mockSource)
        .mockResolvedValueOnce(mockTarget);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await mergeCategoryInto(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(Product.update).not.toHaveBeenCalled();
      expect(Category.update).not.toHaveBeenCalled();
      expect(mockSource.destroy).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: {
            action: 'merge',
            sourceID: '10',
            targetID: '20',
          },
        })
      );

      consoleSpy.mockRestore();
    });

    it('should move products, reparent children, and delete source in POS/DB when read-only mode is false', async () => {
      mockRequest.body = { source_id: 1, target_id: 2 };
      const mockSource = {
        id: 1,
        lightspeed_category_id: '10',
        name: 'Source Cat',
        destroy: jest.fn().mockResolvedValue(true),
      };
      const mockTarget = {
        id: 2,
        lightspeed_category_id: '20',
        name: 'Target Cat',
      };
      (Category.findByPk as jest.Mock)
        .mockResolvedValueOnce(mockSource)
        .mockResolvedValueOnce(mockTarget);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (Product.update as jest.Mock).mockResolvedValue([4]);
      (Category.update as jest.Mock).mockResolvedValue([2]);
      (LightspeedService.deleteCategory as jest.Mock).mockResolvedValue({});
      (LightspeedEntityMap.destroy as jest.Mock).mockResolvedValue(1);

      await mergeCategoryInto(mockRequest as Request, mockResponse as Response);

      expect(Product.update).toHaveBeenCalledWith({ category_id: 2 }, { where: { category_id: 1 } });
      expect(Category.update).toHaveBeenCalledWith({ parent_id: 2 }, { where: { parent_id: 1 } });
      expect(LightspeedService.deleteCategory).toHaveBeenCalledWith('10');
      expect(mockSource.destroy).toHaveBeenCalled();
      expect(LightspeedEntityMap.destroy).toHaveBeenCalledWith({
        where: {
          entity_type: 'category',
          lightspeed_id: '10',
        },
      });
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining("Category 'Source Cat' merged into 'Target Cat' successfully"),
          summary: {
            products_moved: 4,
            children_re_parented: 2,
            source_deleted: 'Source Cat',
            merged_into: 'Target Cat',
          },
        })
      );
    });
  });
});
