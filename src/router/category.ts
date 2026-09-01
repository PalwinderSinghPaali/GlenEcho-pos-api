import { Router } from 'express';
import {
  getCategories,
  getCategoryTree,
  getFeaturedCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryProducts,
  mergeCategoryInto,
} from '@/controllers/category';

const router = Router();

// Retrieve all categories (flat, paginated, searchable)
router.get('/', getCategories);

// Retrieve all categories structured as a tree
router.get('/tree', getCategoryTree);

// Retrieve featured categories (top-level parents with recursive product counts)
router.get('/featured', getFeaturedCategories);

// Retrieve products under a specific category
router.get('/:id/products', getCategoryProducts);

// Retrieve a single category's details (parent, subcategories, metadata)
router.get('/:id', getCategory);

// Create a new category locally (logs Lightspeed payload)
router.post('/', createCategory);

// Update a category locally (recalculates node depth, logs Lightspeed payload)
router.put('/:id', updateCategory);

// Delete a category locally (guards check children/products, logs Lightspeed payload)
router.delete('/:id', deleteCategory);

// Merge a source category into a target category
router.post('/merge', mergeCategoryInto);

export default router;
