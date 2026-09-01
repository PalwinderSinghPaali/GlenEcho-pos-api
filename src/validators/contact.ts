import { body } from 'express-validator';

export const contactSubmissionValidator = [
  body('firstName')
    .trim()
    .notEmpty()
    .withMessage('First name is required')
    .isString()
    .withMessage('First name must be a string')
    .isLength({ max: 100 })
    .withMessage('First name must be under 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email address is required')
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('phone')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Phone number must be a string')
    .isLength({ max: 20 })
    .withMessage('Phone number must be under 20 characters'),
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required')
    .isString()
    .withMessage('Subject must be a string')
    .isLength({ max: 255 })
    .withMessage('Subject must be under 255 characters'),
  body('message')
    .trim()
    .notEmpty()
    .withMessage('Message is required')
    .isString()
    .withMessage('Message must be a string')
    .isLength({ max: 5000 })
    .withMessage('Message must be under 5000 characters'),
  body('honeypot')
    .optional({ nullable: true })
    .isString(),
  body('source')
    .optional()
    .trim()
    .isString()
    .withMessage('Source must be a string')
    .isIn(['contact_us', 'order_query', 'product_inquiry', 'general'])
    .withMessage('Source must be one of: contact_us, order_query, product_inquiry, general')
];
