import { Router } from 'express';
import { getBrands, getBrand, createBrand, updateBrand } from '@/controllers/brand';

const router = Router();

// Retrieve all brands (flat, paginated, searchable)
router.get('/', getBrands);

// Retrieve a single brand's details (sync info)
router.get('/:id', getBrand);

// Create a new brand locally (logs Lightspeed payload)
router.post('/', createBrand);

// Update a brand locally (logs Lightspeed payload)
router.put('/:id', updateBrand);

export default router;
