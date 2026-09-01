import { Router } from 'express';
import { getCustomerTypes, getCustomerType } from '@/controllers/customer-type';

const router = Router();

// Retrieve all customer types (flat, paginated, searchable)
router.get('/', getCustomerTypes);

// Retrieve a single customer type's details
router.get('/:id', getCustomerType);

export default router;
