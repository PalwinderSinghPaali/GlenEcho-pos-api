import { Request, Response } from 'express';
import { getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer } from './index';
import { Customer, CustomerType, Discount, TaxCategory, CreditAccount, LightspeedEntityMap } from '@/database/models';
import { LightspeedService } from '@/services/lightspeed';

jest.mock('@/database/models');
jest.mock('@/services/lightspeed');
jest.mock('@/utils/logger');

describe('Customer Controllers', () => {
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

    Customer.findAndCountAll = jest.fn();
    Customer.findByPk = jest.fn();
    Customer.findOne = jest.fn();
    Customer.create = jest.fn();

    CustomerType.findByPk = jest.fn();
    CustomerType.findOne = jest.fn();

    CreditAccount.findByPk = jest.fn();
    CreditAccount.findOne = jest.fn();

    TaxCategory.findByPk = jest.fn();
    TaxCategory.findOne = jest.fn();

    Discount.findByPk = jest.fn();
    Discount.findOne = jest.fn();

    LightspeedEntityMap.upsert = jest.fn();
    LightspeedEntityMap.destroy = jest.fn();

    LightspeedService.isReadOnlyMode = jest.fn();
    LightspeedService.createCustomer = jest.fn();
    LightspeedService.updateCustomer = jest.fn();
    LightspeedService.deleteCustomer = jest.fn();
    LightspeedService.calculateHash = jest.fn();
    LightspeedService.extractList = jest.fn((res, key) => {
      if (!res) return [];
      if (Array.isArray(res[key])) return res[key];
      if (res[key]) return [res[key]];
      return [];
    });

    jest.clearAllMocks();
  });

  describe('getCustomers', () => {
    it('should return paginated customer records', async () => {
      const mockResult = {
        count: 1,
        rows: [
          {
            id: 1,
            first_name: 'John',
            last_name: 'Doe',
            email_primary: 'john@example.com',
            archived: false,
            toJSON: function () {
              return this;
            },
          },
        ],
      };

      (Customer.findAndCountAll as jest.Mock).mockResolvedValue(mockResult);

      await getCustomers(mockRequest as Request, mockResponse as Response);

      expect(Customer.findAndCountAll).toHaveBeenCalled();
      expect(mockResponse.sendPaginationSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.any(Array),
        1
      );
    });

    it('should apply search filters and status filters', async () => {
      mockRequest.query = {
        search: 'John',
        customerTypeId: '2',
        creditAccountId: '3',
        taxCategoryId: '4',
        discountId: '5',
        archived: 'false',
      };

      (Customer.findAndCountAll as jest.Mock).mockResolvedValue({ count: 0, rows: [] });

      await getCustomers(mockRequest as Request, mockResponse as Response);

      expect(Customer.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customer_type_id: 2,
            credit_account_id: 3,
            tax_category_id: 4,
            discount_id: 5,
            archived: false,
          }),
        })
      );
    });
  });

  describe('getCustomer', () => {
    it('should return a single customer details', async () => {
      mockRequest.params = { id: '1' };

      const mockCust = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        toJSON: function () {
          return this;
        },
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);

      await getCustomer(mockRequest as Request, mockResponse as Response);

      expect(Customer.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(mockResponse, expect.objectContaining({ id: 1 }));
    });

    it('should return error for invalid customer ID', async () => {
      mockRequest.params = { id: 'abc' };
      (Customer.findOne as jest.Mock).mockResolvedValue(null);

      await getCustomer(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Invalid customer ID.');
    });

    it('should return error when customer not found', async () => {
      mockRequest.params = { id: '99' };
      (Customer.findByPk as jest.Mock).mockResolvedValue(null);
      (Customer.findOne as jest.Mock).mockResolvedValue(null);

      await getCustomer(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendError).toHaveBeenCalledWith(mockResponse, 'Customer not found.');
    });
  });

  describe('createCustomer', () => {
    it('should only show payload in console and not write to POS or DB when read-only mode is true', async () => {
      mockRequest.body = {
        first_name: 'Jane',
        last_name: 'Smith',
        email_primary: 'jane@example.com',
        phone_mobile: '5551234567',
        phone_home: '5551112222',
        phone_work: '5553334444',
        phone_pager: '5557778888',
        phone_fax: '5559990000',
        custom: 'VIP Customer',
        tags: 'Loyalty,VIP',
        note: 'Prefers text contact',
        note_is_public: true,
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await createCustomer(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.createCustomer).not.toHaveBeenCalled();
      expect(Customer.create).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            firstName: 'Jane',
            lastName: 'Smith',
            Contact: expect.objectContaining({
              custom: 'VIP Customer',
              Emails: expect.objectContaining({
                ContactEmail: expect.arrayContaining([
                  { address: 'jane@example.com', useType: 'Primary' },
                ]),
              }),
            }),
          }),
        }),
        200
      );

      consoleSpy.mockRestore();
    });

    it('should create customer in Lightspeed POS and local DB when read-only mode is false', async () => {
      mockRequest.body = {
        first_name: 'Alice',
        last_name: 'Smith',
        email_primary: 'alice@example.com',
        email_secondary: 'alice.work@example.com',
        phone_mobile: '5551234567',
        phone_home: '5559876543',
        phone_work: '5554443333',
        phone_pager: '5551112222',
        phone_fax: '5556667777',
        address_1: '123 Garden Way',
        address_2: 'Suite 4',
        city: 'Richmond Hill',
        state: 'Ontario',
        state_code: 'ON',
        zip: 'L4C 3B6',
        country: 'Canada',
        country_code: 'CA',
        website: 'https://alicesmith.com',
        custom: 'Account #A102',
        tags: 'VIP,Wholesale',
        note: 'Special wholesale account',
        note_is_public: true,
        customer_type_id: 1,
        discount_id: 2,
        tax_category_id: 3,
        credit_account_id: 4,
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (CustomerType.findByPk as jest.Mock).mockResolvedValue({
        id: 1,
        lightspeed_customer_type_id: '10',
      });
      (Discount.findByPk as jest.Mock).mockResolvedValue({
        id: 2,
        lightspeed_discount_id: '20',
      });
      (TaxCategory.findByPk as jest.Mock).mockResolvedValue({
        id: 3,
        lightspeed_tax_category_id: '30',
      });
      (CreditAccount.findByPk as jest.Mock).mockResolvedValue({
        id: 4,
        lightspeed_credit_account_id: '40',
      });

      const mockLsCustomer = {
        customerID: '500',
        firstName: 'Alice',
        lastName: 'Smith',
        Contact: { contactID: '800' },
      };
      (LightspeedService.createCustomer as jest.Mock).mockResolvedValue({
        Customer: mockLsCustomer,
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([mockLsCustomer]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashcust');

      const mockCreated = {
        id: 5,
        first_name: 'Alice',
        last_name: 'Smith',
        lightspeed_customer_id: '500',
        contact_id: '800',
        toJSON: function () {
          return this;
        },
      };
      (Customer.create as jest.Mock).mockResolvedValue(mockCreated);
      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCreated);
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await createCustomer(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Alice',
          lastName: 'Smith',
          customerTypeID: 10,
          discountID: 20,
          taxCategoryID: 30,
          creditAccountID: 40,
          Contact: expect.objectContaining({
            custom: 'Account #A102',
            Addresses: expect.objectContaining({
              ContactAddress: expect.objectContaining({
                address1: '123 Garden Way',
                city: 'Richmond Hill',
                state: 'Ontario',
                zip: 'L4C 3B6',
                country: 'Canada',
              }),
            }),
            Phones: expect.objectContaining({
              ContactPhone: expect.arrayContaining([
                { number: '5551234567', useType: 'Mobile' },
                { number: '5559876543', useType: 'Home' },
                { number: '5554443333', useType: 'Work' },
                { number: '5551112222', useType: 'Pager' },
                { number: '5556667777', useType: 'Fax' },
              ]),
            }),
            Emails: expect.objectContaining({
              ContactEmail: expect.arrayContaining([
                { address: 'alice@example.com', useType: 'Primary' },
                { address: 'alice.work@example.com', useType: 'Secondary' },
              ]),
            }),
            Websites: {
              ContactWebsite: [{ url: 'https://alicesmith.com' }],
            },
          }),
          Note: {
            note: 'Special wholesale account',
            isPublic: 'true',
          },
          Tags: [{ tag: 'VIP' }, { tag: 'Wholesale' }],
        })
      );

      expect(Customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Alice',
          last_name: 'Smith',
          lightspeed_customer_id: '500',
          contact_id: '800',
          custom: 'Account #A102',
          tags: ['VIP', 'Wholesale'],
          phone_pager: '5551112222',
          phone_fax: '5556667777',
          discount_id: 2,
          tax_category_id: 3,
          customer_type_id: 1,
        })
      );

      expect(LightspeedEntityMap.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'customer',
          lightspeed_id: '500',
          local_id: 5,
        })
      );

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Customer created successfully in Lightspeed and local database.',
        }),
        201
      );
    });

    it('should format Tags as single object when only one tag is provided', async () => {
      mockRequest.body = {
        first_name: 'Single',
        last_name: 'TagUser',
        tags: 'VIP',
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      const mockLsCustomer = {
        customerID: '501',
        firstName: 'Single',
        lastName: 'TagUser',
      };
      (LightspeedService.createCustomer as jest.Mock).mockResolvedValue({
        Customer: mockLsCustomer,
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([mockLsCustomer]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashcust3');

      const mockCreated = {
        id: 6,
        first_name: 'Single',
        last_name: 'TagUser',
        lightspeed_customer_id: '501',
        tags: ['VIP'],
        toJSON: function () {
          return this;
        },
      };
      (Customer.create as jest.Mock).mockResolvedValue(mockCreated);
      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCreated);
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await createCustomer(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Single',
          lastName: 'TagUser',
          Tags: { tag: 'VIP' },
        })
      );
      expect(Customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Single',
          last_name: 'TagUser',
          tags: ['VIP'],
        })
      );
    });

    it('should handle tags passed as an array of strings in createCustomer', async () => {
      mockRequest.body = {
        first_name: 'Array',
        last_name: 'TagUser',
        tags: ['Landscape', 'Commercial'],
      };

      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      const mockLsCustomer = {
        customerID: '502',
        firstName: 'Array',
        lastName: 'TagUser',
      };
      (LightspeedService.createCustomer as jest.Mock).mockResolvedValue({
        Customer: mockLsCustomer,
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([mockLsCustomer]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashcust4');

      const mockCreated = {
        id: 7,
        first_name: 'Array',
        last_name: 'TagUser',
        lightspeed_customer_id: '502',
        tags: ['Landscape', 'Commercial'],
        toJSON: function () {
          return this;
        },
      };
      (Customer.create as jest.Mock).mockResolvedValue(mockCreated);
      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCreated);
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await createCustomer(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Array',
          lastName: 'TagUser',
          Tags: [{ tag: 'Landscape' }, { tag: 'Commercial' }],
        })
      );
      expect(Customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'Array',
          last_name: 'TagUser',
          tags: ['Landscape', 'Commercial'],
        })
      );
    });
  });

  describe('updateCustomer', () => {
    it('should only show payload in console and not update in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { first_name: 'JohnUpdated' };

      const mockCust = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        lightspeed_customer_id: 'ls_cust_123',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await updateCustomer(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.updateCustomer).not.toHaveBeenCalled();
      expect(mockCust.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          payload: expect.objectContaining({
            firstName: 'JohnUpdated',
            lastName: 'Doe',
          }),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should update customer in Lightspeed POS and DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = {
        first_name: 'JohnUpdated',
        custom: 'Updated Custom Note',
        phone_pager: '5559998888',
        phone_fax: '5557776666',
        discount_id: 3,
      };

      const mockCust = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        lightspeed_customer_id: 'ls_cust_123',
        contact_id: 'contact_456',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (Discount.findByPk as jest.Mock).mockResolvedValue({
        id: 3,
        lightspeed_discount_id: '30',
      });
      (LightspeedService.updateCustomer as jest.Mock).mockResolvedValue({
        Customer: { customerID: 'ls_cust_123' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { customerID: 'ls_cust_123' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashcust2');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateCustomer(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateCustomer).toHaveBeenCalledWith(
        'ls_cust_123',
        expect.objectContaining({
          firstName: 'JohnUpdated',
          discountID: 30,
          Contact: expect.objectContaining({
            custom: 'Updated Custom Note',
            Phones: expect.objectContaining({
              ContactPhone: expect.arrayContaining([
                { number: '5559998888', useType: 'Pager' },
                { number: '5557776666', useType: 'Fax' },
              ]),
            }),
          }),
        })
      );
      expect(mockCust.update).toHaveBeenCalledWith(
        expect.objectContaining({
          first_name: 'JohnUpdated',
          custom: 'Updated Custom Note',
          phone_pager: '5559998888',
          phone_fax: '5557776666',
          discount_id: 3,
        })
      );
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Customer updated successfully in Lightspeed and local database.',
        })
      );
    });

    it('should update customer tags when passed as array of strings in updateCustomer', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = {
        tags: ['VIP', 'Contractor'],
      };

      const mockCust = {
        id: 1,
        first_name: 'John',
        last_name: 'Doe',
        lightspeed_customer_id: 'ls_cust_123',
        contact_id: 'contact_456',
        tags: ['OldTag'],
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.updateCustomer as jest.Mock).mockResolvedValue({
        Customer: { customerID: 'ls_cust_123' },
      });
      (LightspeedService.extractList as jest.Mock).mockReturnValue([
        { customerID: 'ls_cust_123' },
      ]);
      (LightspeedService.calculateHash as jest.Mock).mockReturnValue('mockhashcust5');
      (LightspeedEntityMap.upsert as jest.Mock).mockResolvedValue([{}]);

      await updateCustomer(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.updateCustomer).toHaveBeenCalledWith(
        'ls_cust_123',
        expect.objectContaining({
          Tags: [{ tag: 'VIP' }, { tag: 'Contractor' }],
        })
      );
      expect(mockCust.update).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['VIP', 'Contractor'],
        })
      );
    });
  });

  describe('deleteCustomer', () => {
    it('should only show delete payload in console and not archive in POS or DB when read-only mode is true', async () => {
      mockRequest.params = { id: '1' };

      const mockCust = {
        id: 1,
        lightspeed_customer_id: 'ls_cust_123',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await deleteCustomer(mockRequest as Request, mockResponse as Response);

      expect(consoleSpy).toHaveBeenCalled();
      expect(LightspeedService.deleteCustomer).not.toHaveBeenCalled();
      expect(mockCust.update).not.toHaveBeenCalled();
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: expect.stringContaining('Read-only mode is active'),
          customerID: 'ls_cust_123',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should archive customer in Lightspeed and local DB when read-only mode is false', async () => {
      mockRequest.params = { id: '1' };

      const mockCust = {
        id: 1,
        lightspeed_customer_id: 'ls_cust_123',
        update: jest.fn().mockResolvedValue(true),
        toJSON: function () {
          return this;
        },
      };

      (Customer.findByPk as jest.Mock).mockResolvedValue(mockCust);
      (LightspeedService.isReadOnlyMode as jest.Mock).mockResolvedValue(false);
      (LightspeedService.deleteCustomer as jest.Mock).mockResolvedValue(true);

      await deleteCustomer(mockRequest as Request, mockResponse as Response);

      expect(LightspeedService.deleteCustomer).toHaveBeenCalledWith('ls_cust_123');
      expect(mockCust.update).toHaveBeenCalledWith({ archived: true });
      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          message: 'Customer archived successfully in Lightspeed and local database.',
        })
      );
    });
  });
});
