import { Request, Response } from 'express';
import {
  getBanners,
  getAllBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
} from './index';
import { HomepageBanner } from '@/database/models';
import fs from 'fs';

jest.mock('@/database/models');
jest.mock('@/utils/logger');

describe('Homepage Banner Controllers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let existsSyncSpy: jest.SpyInstance;
  let writeFileSyncSpy: jest.SpyInstance;
  let unlinkSyncSpy: jest.SpyInstance;

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
    
    // Set up spies on fs module
    existsSyncSpy = jest.spyOn(fs, 'existsSync').mockImplementation(() => true);
    writeFileSyncSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    unlinkSyncSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined);
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    existsSyncSpy.mockRestore();
    writeFileSyncSpy.mockRestore();
    unlinkSyncSpy.mockRestore();
  });

  describe('getBanners', () => {
    it('should return active banners sorted', async () => {
      const mockRows = [
        { id: 1, title: 'Banner 1', is_active: true, sort_order: 1 },
        { id: 2, title: 'Banner 2', is_active: true, sort_order: 2 },
      ];
      (HomepageBanner.findAll as jest.Mock).mockResolvedValue(mockRows);

      await getBanners(mockRequest as Request, mockResponse as Response);

      expect(HomepageBanner.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { is_active: true },
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, mockRows);
    });
  });

  describe('getAllBanners', () => {
    it('should return all banners with pagination if enabled', async () => {
      mockRequest.query = { pagination: 'true', page: '1', limit: '10' };
      const mockResult = {
        count: 2,
        rows: [
          { id: 1, title: 'Banner 1', is_active: true },
          { id: 2, title: 'Banner 2', is_active: false },
        ],
      };
      (HomepageBanner.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getAllBanners(mockRequest as Request, mockResponse as Response);

      expect(HomepageBanner.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        mockResult.rows,
        2
      );
    });
  });

  describe('getBanner', () => {
    it('should return a single banner by pk', async () => {
      mockRequest.params = { id: '1' };
      const mockBanner = { id: 1, title: 'Banner 1' };
      (HomepageBanner.findByPk as jest.Mock).mockResolvedValue(mockBanner);

      await getBanner(mockRequest as Request, mockResponse as Response);

      expect(HomepageBanner.findByPk).toHaveBeenCalledWith(1);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, mockBanner);
    });

    it('should return error for invalid ID', async () => {
      mockRequest.params = { id: 'abc' };

      await getBanner(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid banner ID.');
    });

    it('should return error if banner not found', async () => {
      mockRequest.params = { id: '999' };
      (HomepageBanner.findByPk as jest.Mock).mockResolvedValue(null);

      await getBanner(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Banner not found.');
    });
  });

  describe('createBanner', () => {
    it('should create a banner without an image file', async () => {
      mockRequest.body = {
        title: 'New Banner',
        description: 'New Desc',
        button_text: 'Click here',
        button_color: '#ff0000',
        button_text_color: '#ffffff',
      };
      const mockCreated = { id: 1, ...mockRequest.body, image_url: null };
      (HomepageBanner.create as jest.Mock).mockResolvedValue(mockCreated);

      await createBanner(mockRequest as Request, mockResponse as Response);

      expect(HomepageBanner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New Banner',
          image_url: null,
          button_color: '#ff0000',
          button_text_color: '#ffffff',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, mockCreated, 201);
    });

    it('should create a banner and write uploaded file to disk', async () => {
      mockRequest.body = { title: 'Image Banner' };
      const mockFile = {
        originalname: 'test.jpg',
        buffer: Buffer.from('dummy-data'),
      } as Express.Multer.File;
      mockRequest.file = mockFile;

      const mockCreated = { id: 2, title: 'Image Banner', image_url: '/api/v1/lightspeed/images/test.jpg' };
      (HomepageBanner.create as jest.Mock).mockResolvedValue(mockCreated);

      await createBanner(mockRequest as Request, mockResponse as Response);

      expect(writeFileSyncSpy).toHaveBeenCalled();
      expect(HomepageBanner.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Image Banner',
          image_url: expect.stringContaining('/lightspeed/images/'),
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, mockCreated, 201);
    });
  });

  describe('updateBanner', () => {
    it('should update fields of an existing banner', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { title: 'Updated Title' };

      const mockBanner = {
        id: 1,
        title: 'Old Title',
        image_url: null,
        update: jest.fn().mockResolvedValue(true),
      };
      (HomepageBanner.findByPk as jest.Mock).mockResolvedValue(mockBanner);

      await updateBanner(mockRequest as Request, mockResponse as Response);

      expect(mockBanner.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Title',
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, mockBanner);
    });
  });

  describe('deleteBanner', () => {
    it('should destroy / soft-delete the banner', async () => {
      mockRequest.params = { id: '1' };
      const mockBanner = {
        id: 1,
        destroy: jest.fn().mockResolvedValue(true),
      };
      (HomepageBanner.findByPk as jest.Mock).mockResolvedValue(mockBanner);

      await deleteBanner(mockRequest as Request, mockResponse as Response);

      expect(mockBanner.destroy).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ message: 'Banner deleted successfully.' })
      );
    });
  });
});
