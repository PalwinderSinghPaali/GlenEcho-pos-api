import { Router } from 'express';
import {
  getInventories,
  getInventory,
  updateInventory,
} from '@/controllers/inventory';

const router = Router();

// Retrieve all product inventories (paginated, searchable by product description/SKU, filterable by shop/product)
router.get('/', getInventories);

// Retrieve a single inventory record details
router.get('/:id', getInventory);

// Update a product inventory record locally (reorderPoint/reorderLevel, logs Lightspeed payload)
router.put('/:id', updateInventory);

export default router;
