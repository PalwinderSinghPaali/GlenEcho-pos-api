import { Router } from 'express';
import { getRegisters, getRegisterById } from '@/controllers/register';

const router = Router();

// Retrieve all registers (paginated, searchable, filterable by shop/open)
router.get('/', getRegisters);

// Retrieve a single register by ID
router.get('/:id', getRegisterById);

export default router;
