import { Request, Response } from 'express';
import {
  getDashboardSummary,
  getDashboardCollections,
  getDashboardOrders,
  getDashboardWeeklySales,
  getDashboardTopProducts,
  getCollectionsData,
  getOrdersData,
  getWeeklySalesData,
  getTopSellingProductsData,
  parseDashboardSource,
} from './index';
import sequelize from '@/database/connection';

jest.mock('@/database/connection');
jest.mock('@/utils/logger');

describe('Dashboard Controllers', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      query: {},
      params: {},
      body: {},
    };

    mockResponse = {
      sendSuccess: jest.fn(),
      sendError: jest.fn(),
    } as unknown as Partial<Response>;
  });

  describe('parseDashboardSource', () => {
    it('should correctly parse source strings and handle fallbacks', () => {
      expect(parseDashboardSource('web')).toBe('web');
      expect(parseDashboardSource('online')).toBe('web');
      expect(parseDashboardSource('pos')).toBe('pos');
      expect(parseDashboardSource('instore')).toBe('pos');
      expect(parseDashboardSource('all')).toBe('all');
      expect(parseDashboardSource(' POS ')).toBe('pos');
      expect(parseDashboardSource(' WEB ')).toBe('web');
      expect(parseDashboardSource(undefined)).toBe('all');
      expect(parseDashboardSource('invalid')).toBe('all');
    });
  });

  describe('getCollectionsData', () => {
    it('should aggregate web and POS collections correctly when source is all', async () => {
      (sequelize.query as jest.Mock)
        .mockResolvedValueOnce([
          [
            {
              today: '100.50',
              yesterday: '200.25',
              weekly: '800.00',
              this_month: '1500.00',
              last_month: '3000.00',
              all_time: '12000.00',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              today: '50.25',
              yesterday: '75.50',
              weekly: '400.00',
              this_month: '1000.00',
              last_month: '2000.00',
              all_time: '8000.00',
            },
          ],
        ]);

      const result = await getCollectionsData('all');

      expect(result.today).toBe(150.75);
      expect(result.yesterday).toBe(275.75);
      expect(result.weekly).toBe(1200.0);
      expect(result.thisMonth).toBe(2500.0);
      expect(result.lastMonth).toBe(5000.0);
      expect(result.allTime).toBe(20000.0);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown?.web.today).toBe(100.5);
      expect(result.breakdown?.pos.today).toBe(50.25);
    });

    it('should return strictly web collections when source is web', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            today: '100.00',
            yesterday: '50.00',
            weekly: '300.00',
            this_month: '800.00',
            last_month: '1200.00',
            all_time: '5000.00',
          },
        ],
      ]);

      const result = await getCollectionsData('web');

      expect(result.today).toBe(100);
      expect(result.yesterday).toBe(50);
      expect(result.weekly).toBe(300);
      expect(result.thisMonth).toBe(800);
      expect(result.lastMonth).toBe(1200);
      expect(result.allTime).toBe(5000);
      expect(result.breakdown).toBeUndefined();
    });

    it('should return strictly POS collections when source is pos', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            today: '40.00',
            yesterday: '60.00',
            weekly: '250.00',
            this_month: '600.00',
            last_month: '900.00',
            all_time: '3500.00',
          },
        ],
      ]);

      const result = await getCollectionsData('pos');

      expect(result.today).toBe(40);
      expect(result.yesterday).toBe(60);
      expect(result.weekly).toBe(250);
      expect(result.thisMonth).toBe(600);
      expect(result.lastMonth).toBe(900);
      expect(result.allTime).toBe(3500);
      expect(result.breakdown).toBeUndefined();
    });
  });

  describe('getOrdersData', () => {
    it('should return combined order counts and breakdown when source is all', async () => {
      (sequelize.query as jest.Mock)
        .mockResolvedValueOnce([
          [
            {
              total: '10',
              today: '2',
              pending: '1',
              processing: '2',
              completed: '6',
              cancelled: '1',
            },
          ],
        ])
        .mockResolvedValueOnce([
          [
            {
              total: '5',
              today: '1',
              processing: '1',
              completed: '4',
              cancelled: '0',
            },
          ],
        ]);

      const result = await getOrdersData('all');

      expect(result.total).toBe(15);
      expect(result.today).toBe(3);
      expect(result.pending).toBe(1);
      expect(result.processing).toBe(3);
      expect(result.completed).toBe(10);
      expect(result.cancelled).toBe(1);
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown?.web.total).toBe(10);
      expect(result.breakdown?.pos.total).toBe(5);
    });

    it('should return strictly POS order counts when source is pos', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            total: '8',
            today: '2',
            processing: '1',
            completed: '7',
            cancelled: '0',
          },
        ],
      ]);

      const result = await getOrdersData('pos');

      expect(result.total).toBe(8);
      expect(result.today).toBe(2);
      expect(result.pending).toBe(0);
      expect(result.processing).toBe(1);
      expect(result.completed).toBe(7);
      expect(result.cancelled).toBe(0);
      expect(result.breakdown).toBeUndefined();
    });

    it('should return strictly web order counts when source is web', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            total: '12',
            today: '3',
            pending: '2',
            processing: '4',
            completed: '5',
            cancelled: '1',
          },
        ],
      ]);

      const result = await getOrdersData('web');

      expect(result.total).toBe(12);
      expect(result.today).toBe(3);
      expect(result.pending).toBe(2);
      expect(result.processing).toBe(4);
      expect(result.completed).toBe(5);
      expect(result.cancelled).toBe(1);
      expect(result.breakdown).toBeUndefined();
    });
  });

  describe('getWeeklySalesData', () => {
    it('should map weekly graph series with numbers and labels', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            day: '2026-09-03',
            label: 'Sep 03',
            day_of_week: 'Thu',
            sales: '150.75',
            orders: '5',
          },
          {
            day: '2026-09-04',
            label: 'Sep 04',
            day_of_week: 'Fri',
            sales: '220.00',
            orders: '8',
          },
        ],
      ]);

      const result = await getWeeklySalesData('all');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        date: '2026-09-03',
        label: 'Sep 03',
        dayOfWeek: 'Thu',
        sales: 150.75,
        orders: 5,
      });
      expect(result[1]).toEqual({
        date: '2026-09-04',
        label: 'Sep 04',
        dayOfWeek: 'Fri',
        sales: 220,
        orders: 8,
      });
    });
  });

  describe('getTopSellingProductsData', () => {
    it('should calculate percentages and structure top products', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            product_id: 1,
            product_name: 'Product A',
            sku: 'SKU-A',
            units_sold: '60',
            total_revenue: '600.00',
            image_url: 'http://example.com/a.jpg',
          },
          {
            product_id: 2,
            product_name: 'Product B',
            sku: 'SKU-B',
            units_sold: '40',
            total_revenue: '400.00',
            image_url: null,
          },
        ],
      ]);

      const result = await getTopSellingProductsData('all', 5);

      expect(result).toHaveLength(2);
      expect(result[0].percentage).toBe(60);
      expect(result[1].percentage).toBe(40);
      expect(result[0].imageUrl).toBe('http://example.com/a.jpg');
      expect(result[1].imageUrl).toBeNull();
    });
  });

  describe('Route Controllers', () => {
    it('getDashboardSummary should return all dashboard sections in a single payload', async () => {
      // Collections (all) -> web, pos
      (sequelize.query as jest.Mock)
        .mockResolvedValueOnce([[{ today: '100', all_time: '2000' }]])
        .mockResolvedValueOnce([[{ today: '50', all_time: '1000' }]])
        // Orders (all) -> web, pos
        .mockResolvedValueOnce([[{ total: '10', today: '2', pending: '1', processing: '2', completed: '6', cancelled: '1' }]])
        .mockResolvedValueOnce([[{ total: '5', today: '1', processing: '1', completed: '4', cancelled: '0' }]])
        // Weekly graph
        .mockResolvedValueOnce([[{ day: '2026-09-09', label: 'Sep 09', day_of_week: 'Wed', sales: '100', orders: '2' }]])
        // Top products
        .mockResolvedValueOnce([[{ product_id: 1, product_name: 'Item 1', sku: 'SKU1', units_sold: '10', total_revenue: '100', image_url: null }]]);

      await getDashboardSummary(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          collections: expect.any(Object),
          orders: expect.any(Object),
          weeklySales: expect.any(Array),
          topSellingProducts: expect.any(Array),
          meta: expect.objectContaining({ source: 'all' }),
        })
      );
    });

    it('getDashboardCollections should return collections data', async () => {
      mockRequest.query = { source: 'web' };
      (sequelize.query as jest.Mock).mockResolvedValueOnce([[{ today: '50' }]]);

      await getDashboardCollections(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          today: 50,
        })
      );
    });

    it('getDashboardOrders should return orders data for pos', async () => {
      mockRequest.query = { source: 'pos' };
      (sequelize.query as jest.Mock).mockResolvedValueOnce([[{ total: '20', completed: '18', processing: '2' }]]);

      await getDashboardOrders(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.objectContaining({
          total: 20,
          completed: 18,
          processing: 2,
        })
      );
    });

    it('getDashboardWeeklySales should return weekly sales data', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [{ day: '2026-09-09', label: 'Sep 09', day_of_week: 'Wed', sales: '80', orders: '3' }],
      ]);

      await getDashboardWeeklySales(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({
            label: 'Sep 09',
            sales: 80,
            orders: 3,
          }),
        ])
      );
    });

    it('getDashboardTopProducts should return top products data', async () => {
      (sequelize.query as jest.Mock).mockResolvedValueOnce([
        [
          {
            product_id: 1,
            product_name: 'P1',
            sku: 'SKU1',
            units_sold: '5',
            total_revenue: '50',
            image_url: null,
          },
        ],
      ]);

      await getDashboardTopProducts(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.sendSuccess).toHaveBeenCalledWith(
        mockResponse,
        expect.arrayContaining([
          expect.objectContaining({
            productId: 1,
            name: 'P1',
            unitsSold: 5,
          }),
        ])
      );
    });
  });
});
