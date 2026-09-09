import { Router } from 'express';
import { getTaxClasses, getTaxClass, syncTaxClasses } from '@/controllers/tax-class';

const router = Router();

// Retrieve all tax classes (flat, paginated, searchable)
router.get('/', getTaxClasses);

// Trigger on-demand sync from Lightspeed POS
router.post('/sync', syncTaxClasses);

// Retrieve a single tax class's details
router.get('/:id', getTaxClass);

export default router;
