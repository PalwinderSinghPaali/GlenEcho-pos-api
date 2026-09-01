import { Router } from 'express';
import {
  getOrders,
  getOrder,
  updateOrder,
  deleteOrder,
} from '@/controllers/order';

const router = Router();

// Retrieve all orders (paginated, searchable, filterable)
router.get('/', getOrders);

// Retrieve a single order detail
router.get('/:id', getOrder);

// Update an order's status, tracking details or addresses
router.put('/:id', updateOrder);

// Cancel/delete an order (releases local reservations and voids sale in POS)
router.delete('/:id', deleteOrder);

export default router;
