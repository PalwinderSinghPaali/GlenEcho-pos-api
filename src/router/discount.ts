import { Router } from 'express';
import { getDiscounts, getDiscount } from '@/controllers/discount';

const router = Router();

// Retrieve all discounts (flat, paginated, searchable)
router.get('/', getDiscounts);

// Retrieve a single discount's details
router.get('/:id', getDiscount);

export default router;
