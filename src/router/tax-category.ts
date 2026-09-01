import { Router } from 'express';
import { getTaxCategories, getTaxCategory } from '@/controllers/tax-category';

const router = Router();

// Retrieve all tax categories (flat, paginated, searchable)
router.get('/', getTaxCategories);

// Retrieve a single tax category's details
router.get('/:id', getTaxCategory);

export default router;
