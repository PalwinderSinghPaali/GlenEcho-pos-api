import { Router } from 'express';
import { getCurrencyRates, getCurrencyRate } from '@/controllers/currency-rate';

const router = Router();

router.get('/', getCurrencyRates);
router.get('/:id', getCurrencyRate);

export default router;
