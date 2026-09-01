import { Router } from 'express';
import { createPaymentIntent, handleWebhook } from '@/controllers/checkout';

const router = Router();

// Route to initialize Stripe Payment Intent and place a local stock reservation
router.post('/create-intent', createPaymentIntent);

// Webhook endpoint for Stripe async status notifications
router.post('/webhook', handleWebhook);

export default router;
