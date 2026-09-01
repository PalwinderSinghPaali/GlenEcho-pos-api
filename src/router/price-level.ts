import { Router } from 'express';
import { getPriceLevels, getPriceLevel } from '@/controllers/price-level';

const router = Router();

router.get('/', getPriceLevels);
router.get('/:id', getPriceLevel);

export default router;
