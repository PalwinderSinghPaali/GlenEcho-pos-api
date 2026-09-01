import { Request, Response } from 'express';
import { getVendors, getVendor, createVendor, updateVendor, deleteVendor } from './index';
import { Vendor, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Vendor Controller', () => {
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

  describe('getVendors', () => {
    it('should return paginated vendors when pagination=true', async () => {
      mockRequest.query = { pagination: 'true' };
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            lightspeed_vendor_id: '100',
            name: 'Supplier A',
            toJSON: () => ({ id: 1, lightspeed_vendor_id: '100', name: 'Supplier A' }),
          },
        ],
      };
      (Vendor.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getVendors(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([expect.objectContaining({ name: 'Supplier A', vendorID: 100 })]),
        1
      );
    });

    it('should return list of vendors when pagination is not true', async () => {
      (Vendor.findAll as jest.Mock).mockResolvedValue([
        {
          id: 1,
          lightspeed_vendor_id: '100',
          name: 'Supplier A',
          toJSON: () => ({ id: 1, lightspeed_vendor_id: '100', name: 'Supplier A' }),
        },
      ]);

      await getVendors(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([expect.objectContaining({ name: 'Supplier A' })])
      );
    });
  });

  describe('getVendor', () => {
    it('should return 400 for invalid ID', async () => {
      mockRequest.params = { id: 'abc' };
      await getVendor(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid vendor ID.');
    });

    it('should return 404 if vendor not found', async () => {
      mockRequest.params = { id: '1' };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(null);
      await getVendor(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Vendor not found.');
    });

    it('should return single vendor with sync info', async () => {
      mockRequest.params = { id: '1' };
      const mockVendor = {
        id: 1,
        lightspeed_vendor_id: '100',
        name: 'Supplier A',
        toJSON: () => ({ id: 1, lightspeed_vendor_id: '100', name: 'Supplier A' }),
      };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(mockVendor);
      (LightspeedEntityMap.findOne as jest.Mock).mockResolvedValue({
        id: 5,
        lightspeed_id: '100',
        local_id: 1,
        last_sync: new Date(),
        hash: 'hash1',
      });

      await getVendor(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          name: 'Supplier A',
          vendorID: 100,
          lightspeed_sync_info: expect.objectContaining({
            entity_map_id: 5,
            lightspeed_id: '100',
          }),
        })
      );
    });
  });

  describe('createVendor', () => {
    it('should return error if name is missing', async () => {
      mockRequest.body = {};
      await createVendor(mockRequest as Request, mockResponse as Response);
      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Vendor name is required.');
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.body = {
        name: 'Test Nursery Supplier',
        accountNumber: 'ACC123',
        phone: '555-1234',
        email: 'supplier@test.com',
      };
      (Vendor.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await createVendor(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.createVendor).not.toHaveBeenCalled();
      expect(Vendor.create).not.toHaveBeenCalled();
      expect(LightspeedEntityMap.upsert).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            name: 'Test Nursery Supplier',
            accountNumber: 'ACC123',
          }),
        }),
        200
      );

      consoleSpy.mockRestore();
    });

    it('should write to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.body = {
        name: 'Live Nursery Supplier',
        accountNumber: 'ACC999',
        phone: '555-9876',
        email: 'live@test.com',
        city: 'Hamilton',
      };
      (Vendor.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createVendor as jest.Mock).mockResolvedValue({
        Vendor: {
          vendorID: '789',
          name: 'Live Nursery Supplier',
          archived: 'false',
        },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        {
          vendorID: '789',
          name: 'Live Nursery Supplier',
          archived: 'false',
        },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhash123');

      const mockCreatedVendor = {
        id: 10,
        name: 'Live Nursery Supplier',
        lightspeed_vendor_id: '789',
        archived: false,
        toJSON: () => ({
          id: 10,
          name: 'Live Nursery Supplier',
          lightspeed_vendor_id: '789',
          archived: false,
        }),
      };
      (Vendor.create as jest.Mock).mockResolvedValue(mockCreatedVendor);
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await createVendor(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createVendor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Live Nursery Supplier',
          accountNumber: 'ACC999',
        })
      );
      expect(Vendor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Live Nursery Supplier',
          lightspeed_vendor_id: '789',
        })
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'vendor',
          lightspeed_id: '789',
          local_id: 10,
          hash: 'mockhash123',
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

    it('should properly structure and persist custom, mobile, fax, email 2, and contact flags', async () => {
      mockRequest.body = {
        name: 'Multi Contact Supplier',
        custom: 'Special Nursery Notes',
        phone: '905-111-1111',
        mobile: '416-222-2222',
        fax: '905-333-3333',
        email: 'primary@supplier.com',
        email_2: 'secondary@supplier.com',
        no_email: true,
        no_phone: true,
        no_mail: true,
      };
      (Vendor.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.createVendor as jest.Mock).mockResolvedValue({
        Vendor: {
          vendorID: '888',
          name: 'Multi Contact Supplier',
          archived: 'false',
          Contact: {
            contactID: '99',
            custom: 'Special Nursery Notes',
          },
        },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        {
          vendorID: '888',
          name: 'Multi Contact Supplier',
          archived: 'false',
          Contact: {
            contactID: '99',
            custom: 'Special Nursery Notes',
          },
        },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashmulti');

      const mockCreatedVendor = {
        id: 20,
        name: 'Multi Contact Supplier',
        lightspeed_vendor_id: '888',
        phone: '905-111-1111',
        phone_mobile: '416-222-2222',
        phone_fax: '905-333-3333',
        email: 'primary@supplier.com',
        email_secondary: 'secondary@supplier.com',
        custom: 'Special Nursery Notes',
        contact_id: '99',
        no_email: true,
        no_phone: true,
        no_mail: true,
        toJSON: () => ({
          id: 20,
          name: 'Multi Contact Supplier',
          lightspeed_vendor_id: '888',
          phone: '905-111-1111',
          phone_mobile: '416-222-2222',
          phone_fax: '905-333-3333',
          email: 'primary@supplier.com',
          email_secondary: 'secondary@supplier.com',
          custom: 'Special Nursery Notes',
          contact_id: '99',
          no_email: true,
          no_phone: true,
          no_mail: true,
        }),
      };
      (Vendor.create as jest.Mock).mockResolvedValue(mockCreatedVendor);
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await createVendor(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createVendor).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Multi Contact Supplier',
          Contact: expect.objectContaining({
            custom: 'Special Nursery Notes',
            noEmail: 'true',
            noPhone: 'true',
            noMail: 'true',
            Phones: {
              ContactPhone: expect.arrayContaining([
                { number: '905-111-1111', useType: 'Work' },
                { number: '416-222-2222', useType: 'Mobile' },
                { number: '905-333-3333', useType: 'Fax' },
              ]),
            },
            Emails: {
              ContactEmail: expect.arrayContaining([
                { address: 'primary@supplier.com', useType: 'Primary' },
                { address: 'secondary@supplier.com', useType: 'Secondary' },
              ]),
            },
          }),
        })
      );

      expect(Vendor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          custom: 'Special Nursery Notes',
          contact_id: '99',
          phone: '905-111-1111',
          phone_mobile: '416-222-2222',
          phone_fax: '905-333-3333',
          email: 'primary@supplier.com',
          email_secondary: 'secondary@supplier.com',
          no_email: true,
          no_phone: true,
          no_mail: true,
        })
      );
    });
  });

  describe('updateVendor', () => {
    it('should return error if vendor not found', async () => {
      mockRequest.params = { id: '999' };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(null);

      await updateVendor(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Vendor not found.');
    });

    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Vendor Name' };
      const mockVendor = {
        id: 1,
        lightspeed_vendor_id: '123',
        name: 'Original Vendor Name',
        archived: false,
        update: jest.fn(),
      };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(mockVendor);
      (Vendor.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateVendor(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.updateVendor).not.toHaveBeenCalled();
      expect(mockVendor.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            name: 'Updated Vendor Name',
          }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should write to Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Live Vendor' };
      const mockVendor = {
        id: 1,
        lightspeed_vendor_id: '123',
        name: 'Original Vendor',
        archived: false,
        update: jest.fn().mockResolvedValue(true),
        toJSON: () => ({
          id: 1,
          lightspeed_vendor_id: '123',
          name: 'Updated Live Vendor',
        }),
      };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(mockVendor);
      (Vendor.findOne as jest.Mock).mockResolvedValue(null);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateVendor as jest.Mock).mockResolvedValue({});
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashupdate');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateVendor(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateVendor).toHaveBeenCalledWith(
        '123',
        expect.objectContaining({
          name: 'Updated Live Vendor',
        })
      );
      expect(mockVendor.update).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Live Vendor',
          lightspeed_vendor_id: '123',
        })
      );
      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'vendor',
          lightspeed_id: '123',
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
  });

  describe('deleteVendor', () => {
    it('should return error if vendor not found', async () => {
      mockRequest.params = { id: '999' };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(null);

      await deleteVendor(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Vendor not found.');
    });

    it('should only show payload in console and not delete in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      const mockVendor = {
        id: 1,
        lightspeed_vendor_id: '123',
        name: 'Vendor To Delete',
        destroy: jest.fn(),
      };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(mockVendor);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await deleteVendor(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.archiveVendor).not.toHaveBeenCalled();
      expect(mockVendor.destroy).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          vendorID: '123',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should archive in Lightspeed POS and delete locally when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      const mockVendor = {
        id: 1,
        lightspeed_vendor_id: '123',
        name: 'Vendor To Delete',
        destroy: jest.fn().mockResolvedValue(true),
      };
      (Vendor.findByPk as jest.Mock).mockResolvedValue(mockVendor);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.archiveVendor as jest.Mock).mockResolvedValue({});
      (LightspeedEntityMap.destroy as jest.Mock).mockResolvedValue(1);

      await deleteVendor(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.archiveVendor).toHaveBeenCalledWith('123');
      expect(mockVendor.destroy).toHaveBeenCalled();
      expect(LightspeedEntityMap.destroy).toHaveBeenCalledWith({
        where: {
          entity_type: 'vendor',
          lightspeed_id: '123',
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
