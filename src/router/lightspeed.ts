import { Router } from 'express';
import {
  triggerSync,
  getQueue,
  updateProductPrice,
  getProducts,
  getDashboard,
  retryJob,
  triggerBootstrap,
  triggerSalesSync,
  getAuthUrl,
  authCallback,
  serveImage,
  getReadOnlyStatus,
  setReadOnlyMode,
  migrateImagePaths,
} from '@/controllers/lightspeed';

const router = Router();

router.post('/sync', triggerSync);
router.get('/queue', getQueue);
router.post('/price-update', updateProductPrice);
router.get('/products', getProducts);

// Serving images locally
router.get('/images/:filename', serveImage);
router.post('/images/migrate-paths', migrateImagePaths);

// Dashboard, retry, and bootstrap
router.get('/dashboard', getDashboard);
router.post('/queue/retry/:jobId', retryJob);
router.post('/sync/bootstrap', triggerBootstrap);
router.post('/sync/sales', triggerSalesSync);
router.get('/sync/sales', triggerSalesSync);

// Read-only mode management (protects live Lightspeed POS from write operations)
router.get('/read-only', getReadOnlyStatus);
router.patch('/read-only', setReadOnlyMode);

// OAuth flows
router.get('/auth/url', getAuthUrl);
router.get('/auth/callback', authCallback);

export default router;
