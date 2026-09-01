import { Router } from 'express';
import { getEmployees, getEmployeeById } from '@/controllers/employee';

const router = Router();

// Retrieve all employees (paginated, searchable, filterable by shop/lockout/archived)
router.get('/', getEmployees);

// Retrieve a single employee by ID
router.get('/:id', getEmployeeById);

export default router;
