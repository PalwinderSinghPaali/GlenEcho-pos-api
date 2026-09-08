import { Request, Response } from 'express';
import { getTaxClasses, getTaxClass, syncTaxClasses } from './index';
import { TaxClass, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('TaxClass Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      query: {},
      params: {},
    };

    mockResponse = {
      sendSuccess: jest.fn(),
      sendError: jest.fn(),
      sendPaginationSuccess: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    } as unknown as Partial<Response>;

    TaxClass.findAll = jest.fn();
    TaxClass.findAndCountAll = jest.fn();
    TaxClass.findByPk = jest.fn();
    TaxClass.findOne = jest.fn();
    LightspeedEntityMap.findAll = jest.fn().mockResolvedValue([]);
    LightspeedEntityMap.findOne = jest.fn().mockResolvedValue(null);
  });

  describe('getTaxClasses', () => {
    it('should retrieve all tax classes without pagination', async () => {
      const mockTaxClasses = [
        {
          id: 1,
          lightspeed_tax_class_id: '1',
          name: 'Item',
          toJSON: () => ({ id: 1, lightspeed_tax_class_id: '1', name: 'Item' }),
        },
        {
          id: 2,
          lightspeed_tax_class_id: '2',
          name: 'Labor',
          toJSON: () => ({ id: 2, lightspeed_tax_class_id: '2', name: 'Labor' }),
        },
      ];

      (TaxClass.findAll as jest.Mock).mockResolvedValue(mockTaxClasses);

      await getTaxClasses(mockRequest as Request, mockResponse as Response);

      expect(TaxClass.findAll).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'Item', lightspeed_tax_class_id: '1' }),
          expect.objectContaining({ id: 2, name: 'Labor', lightspeed_tax_class_id: '2' }),
        ])
      );
    });

    it('should support pagination when pagination query param is true', async () => {
      mockRequest.query = { pagination: 'true', page: '1', limit: '10' };

      const mockRows = [
        {
          id: 1,
          lightspeed_tax_class_id: '1',
          name: 'Item',
          toJSON: () => ({ id: 1, lightspeed_tax_class_id: '1', name: 'Item' }),
        },
      ];

      (TaxClass.findAndCountAll as jest.Mock).mockResolvedValue({
        count: 1,
        rows: mockRows,
      });

      await getTaxClasses(mockRequest as Request, mockResponse as Response);

      expect(TaxClass.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({ id: 1, name: 'Item' }),
        ]),
        1
      );
    });

    it('should apply search filter when search param is provided', async () => {
      mockRequest.query = { search: 'Labor' };

      (TaxClass.findAll as jest.Mock).mockResolvedValue([]);

      await getTaxClasses(mockRequest as Request, mockResponse as Response);

      expect(TaxClass.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.any(Object),
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, []);
    });
  });

  describe('getTaxClass', () => {
    it('should retrieve a single tax class by local primary key ID', async () => {
      mockRequest.params = { id: '1' };

      const mockTaxClass = {
        id: 1,
        lightspeed_tax_class_id: '1',
        name: 'Item',
        toJSON: () => ({ id: 1, lightspeed_tax_class_id: '1', name: 'Item' }),
      };

      (TaxClass.findByPk as jest.Mock).mockResolvedValue(mockTaxClass);

      await getTaxClass(mockRequest as Request, mockResponse as Response);

      expect(TaxClass.findByPk).toHaveBeenCalledWith(1);
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ id: 1, name: 'Item' })
      );
    });

    it('should retrieve a tax class by lightspeed_tax_class_id when PK lookup returns null', async () => {
      mockRequest.params = { id: '999' };

      const mockTaxClass = {
        id: 3,
        lightspeed_tax_class_id: '999',
        name: 'Special Tax Class',
        toJSON: () => ({ id: 3, lightspeed_tax_class_id: '999', name: 'Special Tax Class' }),
      };

      (TaxClass.findByPk as jest.Mock).mockResolvedValue(null);
      (TaxClass.findOne as jest.Mock).mockResolvedValue(mockTaxClass);

      await getTaxClass(mockRequest as Request, mockResponse as Response);

      expect(TaxClass.findOne).toHaveBeenCalledWith({
        where: { lightspeed_tax_class_id: '999' },
      });
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({ id: 3, lightspeed_tax_class_id: '999' })
      );
    });

    it('should return error if tax class is not found', async () => {
      mockRequest.params = { id: '9999' };

      (TaxClass.findByPk as jest.Mock).mockResolvedValue(null);
      (TaxClass.findOne as jest.Mock).mockResolvedValue(null);

      await getTaxClass(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Tax class not found.');
    });
  });

  describe('syncTaxClasses', () => {
    it('should trigger Lightspeed sync and return synchronized tax classes', async () => {
      const mockSynced = [
        { id: 1, lightspeed_tax_class_id: '1', name: 'Item' },
        { id: 2, lightspeed_tax_class_id: '2', name: 'Labor' },
      ];

      (LightspeedService.syncTaxClasses as jest.Mock).mockResolvedValue(mockSynced);

      await syncTaxClasses(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.syncTaxClasses).toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Successfully synchronized 2 tax classes'),
          taxClasses: mockSynced,
        })
      );
    });

    it('should handle error when sync fails', async () => {
      (LightspeedService.syncTaxClasses as jest.Mock).mockRejectedValue(new Error('Network error'));

      await syncTaxClasses(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Network error');
    });
  });
});
