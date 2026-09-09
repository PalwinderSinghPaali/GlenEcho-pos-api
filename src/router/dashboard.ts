import { Router } from 'express';
import {
  getDashboardSummary,
  getDashboardCollections,
  getDashboardOrders,
  getDashboardWeeklySales,
  getDashboardTopProducts,
} from '@/controllers/dashboard';

const router = Router();

// 1. GET /api/v1/dashboard - Master dashboard summary
router.get('/', getDashboardSummary);
router.get('/summary', getDashboardSummary);

// 2. GET /api/v1/dashboard/collections - Today, Yesterday, Weekly, Monthly, Last Month, All-time
router.get('/collections', getDashboardCollections);

// 3. GET /api/v1/dashboard/orders - Today, Total, Pending, Processing, Completed, Cancelled
router.get('/orders', getDashboardOrders);

// 4. GET /api/v1/dashboard/weekly-sales - 7-day daily collection & sales/orders graph dataset
router.get('/weekly-sales', getDashboardWeeklySales);

// 5. GET /api/v1/dashboard/top-products - Top 5 highest selling products with pie chart shares
router.get('/top-products', getDashboardTopProducts);

export default router;
