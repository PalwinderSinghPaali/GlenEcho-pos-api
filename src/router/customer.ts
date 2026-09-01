import { Router } from 'express';
import {
  getCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from '@/controllers/customer';
import { validate } from '@/middleware/validator';
import {
  customerCreateValidator,
  customerUpdateValidator,
} from '@/validators/customer';

const router = Router();

// Retrieve all customers (paginated, searchable, filterable)
router.get('/', getCustomers);

// Retrieve a single customer detail
router.get('/:id', getCustomer);

// Create a new customer locally and queue push job
router.post('/', validate(customerCreateValidator), createCustomer);

// Update a customer locally and queue push job
router.put('/:id', validate(customerUpdateValidator), updateCustomer);

// Delete/Archive a customer locally and queue archive job
router.delete('/:id', deleteCustomer);

export default router;
