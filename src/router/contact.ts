import { Router } from 'express';
import { submitContactForm } from '@/controllers/contact';
import { contactRateLimiter } from '@/middleware/rate-limiter';
import { validate } from '@/middleware/validator';
import { contactSubmissionValidator } from '@/validators/contact';

const router = Router();

router.post('/', contactRateLimiter, validate(contactSubmissionValidator), submitContactForm);

export default router;
