import { Request, Response } from 'express';
import {
  getTags,
  getTag,
  createTag,
  updateTag,
  deleteTag,
} from './index';
import { Tag, LightspeedEntityMap, ProductTag } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Tag Controllers', () => {
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
    Tag.count = jest.fn();
    ProductTag.count = jest.fn();
    ProductTag.destroy = jest.fn();
    Tag.update = jest.fn();
    Tag.findByPk = jest.fn();
    Tag.findOne = jest.fn();
    Tag.findAndCountAll = jest.fn();
    Tag.findAll = jest.fn();
    Tag.create = jest.fn();
    Tag.upsert = jest.fn();
    jest.clearAllMocks();
  });

  describe('getTags', () => {
    it('should return paginated tags when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_tag_id: '10',
            name: 'Perennial',
            archived: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            toJSON: function () {
              return {
                id: 1,
                lightspeed_tag_id: '10',
                name: 'Perennial',
                archived: false,
              };
            },
          },
        ],
      };
      (Tag.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getTags(mockRequest as Request, mockResponse as Response);

      expect(Tag.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should return all tags when pagination is not true', async () => {
      mockRequest.query = {};
      const mockRows = [
        {
          id: 1,
          lightspeed_tag_id: '10',
          name: 'Perennial',
          archived: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          toJSON: function () {
            return {
              id: 1,
              lightspeed_tag_id: '10',
              name: 'Perennial',
              archived: false,
            };
          },
        },
      ];
      (Tag.findAll as jest.Mock).mockResolvedValue(mockRows);

      await getTags(mockRequest as Request, mockResponse as Response);

      expect(Tag.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, expect.any(Array));
    });
  });

  describe('getTag', () => {
    it('should return error for invalid tag ID', async () => {
      mockRequest.params = { id: 'abc' };
      await getTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid tag ID.');
    });

    it('should return error if tag not found', async () => {
      mockRequest.params = { id: '999' };
      (Tag.findByPk as jest.Mock).mockResolvedValue(null);

      await getTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tag not found.');
    });

    it('should return a single tag details with sync metadata', async () => {
      mockRequest.params = { id: '1' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: '10',
        name: 'Perennial',
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        toJSON: function () {
          return {
            id: 1,
            lightspeed_tag_id: '10',
            name: 'Perennial',
            archived: false,
          };
        },
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue({
        id: 3,
        lightspeed_id: '10',
        local_id: 1,
        last_sync: new Date(),
        hash: 'mocktaghash',
      });

      await getTag(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          id: 1,
          name: 'Perennial',
          lightspeed_sync_info: expect.objectContaining({
            lightspeed_id: '10',
            hash: 'mocktaghash',
          }),
        })
      );
    });
  });

  describe('createTag', () => {
    it('should return error if name is missing', async () => {
      mockRequest.body = {};
      await createTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tag name is required.');
    });

    it('should return error if tag with same name already exists', async () => {
      mockRequest.body = { name: 'Existing Tag' };
      (Tag.findOne as jest.Mock).mockResolvedValue({ id: 1, name: 'Existing Tag' });

      await createTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        "Tag with name 'Existing Tag' already exists."
      );
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.body = { name: 'New Tag' };
      (Tag.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await createTag(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.createTag).not.toHaveBeenCalled();
      expect(Tag.create).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: { name: 'New Tag' },
        }),
        200
      );

      consoleSpy.mockRestore();
    });

    it('should write to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.body = { name: 'Live Tag' };
      (Tag.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createTag as jest.Mock).mockResolvedValue({
        Tag: { tagID: '105', name: 'Live Tag' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { tagID: '105', name: 'Live Tag' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mocktaghash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      const mockCreatedTag = {
        id: 7,
        lightspeed_tag_id: '105',
        name: 'Live Tag',
        archived: false,
        toJSON: () => ({
          id: 7,
          lightspeed_tag_id: '105',
          name: 'Live Tag',
          archived: false,
        }),
      };
      (Tag.create as jest.Mock).mockResolvedValue(mockCreatedTag);

      await createTag(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createTag).toHaveBeenCalledWith({ name: 'Live Tag' });
      expect(Tag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Live Tag',
          lightspeed_tag_id: '105',
        })
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'tag',
          lightspeed_id: '105',
          local_id: 7,
          hash: 'mocktaghash',
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

  describe('updateTag', () => {
    it('should return error for invalid tag ID', async () => {
      mockRequest.params = { id: 'abc' };
      await updateTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid tag ID.');
    });

    it('should return error if tag not found', async () => {
      mockRequest.params = { id: '999' };
      (Tag.findByPk as jest.Mock).mockResolvedValue(null);

      await updateTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tag not found.');
    });

    it('should return error if name is empty string', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: '   ' };
      (Tag.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Old' });

      await updateTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tag name cannot be empty.');
    });

    it('should return error if duplicate tag name exists', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Existing Tag' };
      (Tag.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Old Tag' });
      (Tag.findOne as jest.Mock).mockResolvedValue({ id: 2, name: 'Existing Tag' });

      await updateTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        "Another tag with name 'Existing Tag' already exists."
      );
    });

    it('should only show payload in console and not update in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Tag' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: '105',
        name: 'Old Tag',
        archived: false,
        update: jest.fn(),
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (Tag.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateTag(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.updateTag).not.toHaveBeenCalled();
      expect(mockTag.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: { name: 'Updated Tag' },
        })
      );

      consoleSpy.mockRestore();
    });

    it('should update in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Tag Live' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: '105',
        name: 'Old Tag',
        archived: false,
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_tag_id: '105',
          name: 'Updated Tag Live',
          archived: false,
        }),
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (Tag.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateTag as jest.Mock).mockResolvedValue({});
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockupdatehash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateTag(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateTag).toHaveBeenCalledWith('105', { name: 'Updated Tag Live' });
      expect(mockTag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Tag Live',
          lightspeed_tag_id: '105',
        })
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'tag',
          lightspeed_id: '105',
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

    it('should create in POS if tag only has a local ID', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Tag Promoted' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: 'local_112233',
        name: 'Local Tag',
        archived: false,
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_tag_id: '109',
          name: 'Tag Promoted',
          archived: false,
        }),
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (Tag.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createTag as jest.Mock).mockResolvedValue({
        Tag: { tagID: '109', name: 'Tag Promoted' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { tagID: '109', name: 'Tag Promoted' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockpromotedhash');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateTag(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createTag).toHaveBeenCalledWith({ name: 'Tag Promoted' });
      expect(mockTag.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tag Promoted',
          lightspeed_tag_id: '109',
        })
      );
    });
  });

  describe('deleteTag', () => {
    it('should return error for invalid tag ID', async () => {
      mockRequest.params = { id: 'abc' };
      await deleteTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid tag ID.');
    });

    it('should return error if tag not found', async () => {
      mockRequest.params = { id: '999' };
      (Tag.findByPk as jest.Mock).mockResolvedValue(null);

      await deleteTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tag not found.');
    });

    it('should return error if products are associated and force is not true', async () => {
      mockRequest.params = { id: '1' };
      (Tag.findByPk as jest.Mock).mockResolvedValue({ id: 1, name: 'Tag In Use' });
      (ProductTag.count as jest.Mock).mockResolvedValue(4);

      await deleteTag(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(
        mockResponse,
        expect.stringContaining("Cannot delete tag 'Tag In Use': 4 products are associated with it")
      );
    });

    it('should disassociate products when force=true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.query = { force: 'true' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: '105',
        name: 'Tag In Use',
        destroy: jest.fn().mockResolvedValue(true),
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (ProductTag.count as jest.Mock).mockResolvedValue(2);
      (ProductTag.destroy as jest.Mock).mockResolvedValue(2);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.deleteTag as jest.Mock).mockResolvedValue({});
      (LightspeedEntityMap.destroy as jest.Mock).mockResolvedValue(1);

      await deleteTag(mockRequest as Request, mockResponse as Response);

      expect(ProductTag.destroy).toHaveBeenCalledWith({ where: { tag_id: 1 } });
      expect(LightspeedService.deleteTag).toHaveBeenCalledWith('105');
      expect(mockTag.destroy).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          warning: '2 product associations were removed.',
        })
      );
    });

    it('should only show payload in console and not delete in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: '105',
        name: 'Tag To Delete',
        destroy: jest.fn(),
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (ProductTag.count as jest.Mock).mockResolvedValue(0);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await deleteTag(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.deleteTag).not.toHaveBeenCalled();
      expect(mockTag.destroy).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          tagID: '105',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should delete in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      const mockTag = {
        id: 1,
        lightspeed_tag_id: '105',
        name: 'Tag To Delete',
        destroy: jest.fn().mockResolvedValue(true),
      };
      (Tag.findByPk as jest.Mock).mockResolvedValue(mockTag);
      (ProductTag.count as jest.Mock).mockResolvedValue(0);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.deleteTag as jest.Mock).mockResolvedValue({});
      (LightspeedEntityMap.destroy as jest.Mock).mockResolvedValue(1);

      await deleteTag(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.deleteTag).toHaveBeenCalledWith('105');
      expect(mockTag.destroy).toHaveBeenCalled();
      expect(LightspeedEntityMap.destroy).toHaveBeenCalledWith({
        where: {
          entity_type: 'tag',
          lightspeed_id: '105',
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
});
