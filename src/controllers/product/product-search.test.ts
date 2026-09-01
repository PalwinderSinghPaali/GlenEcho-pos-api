import { Request, Response } from 'express';
import { searchProducts } from './index';
import { Product } from '@/database/models';
import sequelize from '@/database/connection';

jest.mock('@/database/models');
jest.mock('@/utils/logger');

describe('Product Search Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let literalSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRequest = {
      query: {},
    };
    mockResponse = {
      sendSuccess: jest.fn(),
      sendPaginationSuccess: jest.fn(),
      sendError: jest.fn(),
    } as unknown as Partial<Response>;
    literalSpy = jest.spyOn(sequelize, 'literal');
    jest.clearAllMocks();
  });

  afterEach(() => {
    literalSpy.mockRestore();
  });

  it('should parse simple query words and map to tsquery correctly', async () => {
    mockRequest.query = { q: 'Audrey Pull-On' };

    (Product.findAndCountAll as jest.Mock).mockResolvedValue({ count: 0, rows: [] });

    await searchProducts(mockRequest as Request, mockResponse as Response);

    expect(literalSpy).toHaveBeenCalledWith(
      expect.stringContaining("tsv_search @@ to_tsquery('english', 'audrey:* & pull:* & on:*')")
    );
  });

  it('should handle special characters and spaces correctly without merging words', async () => {
    mockRequest.query = { q: 'Alison Sheri #A47407 - Reversible Denim Pants - Indigo/Floral- XS-X' };

    (Product.findAndCountAll as jest.Mock).mockResolvedValue({ count: 0, rows: [] });

    await searchProducts(mockRequest as Request, mockResponse as Response);

    // Verify it split the special character-joined words properly into separate prefixes joined with &
    expect(literalSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "tsv_search @@ to_tsquery('english', 'alison:* & sheri:* & a47407:* & reversible:* & denim:* & pants:* & indigo:* & floral:* & xs:* & x:*')"
      )
    );
  });
});
