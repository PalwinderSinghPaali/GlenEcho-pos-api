import { Router } from 'express';
import {
  getVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
} from '@/controllers/vendor';

const router = Router();

// Retrieve all vendors (flat, paginated, searchable)
router.get('/', getVendors);

// Retrieve a single vendor's details (sync info)
router.get('/:id', getVendor);

// Create a new vendor locally (logs Lightspeed payload)
router.post('/', createVendor);

// Update a vendor locally (logs Lightspeed payload)
router.put('/:id', updateVendor);

// Delete a vendor locally (logs Lightspeed payload)
router.delete('/:id', deleteVendor);

export default router;
