import { body } from 'express-validator';

export const homepageBannerValidator = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isString()
    .withMessage('Title must be a string')
    .isLength({ max: 255 })
    .withMessage('Title must be under 255 characters'),
  body('description')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Description must be a string'),
  body('color')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Color must be a string')
    .isLength({ max: 50 })
    .withMessage('Color must be under 50 characters'),
  body('link_url')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Link URL must be a string')
    .isLength({ max: 512 })
    .withMessage('Link URL must be under 512 characters'),
  body('button_text')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Button text must be a string')
    .isLength({ max: 100 })
    .withMessage('Button text must be under 100 characters'),
  body('button_color')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Button color must be a string')
    .isLength({ max: 50 })
    .withMessage('Button color must be under 50 characters'),
  body('button_text_color')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isString()
    .withMessage('Button text color must be a string')
    .isLength({ max: 50 })
    .withMessage('Button text color must be under 50 characters'),
  body('is_active').optional().toBoolean().isBoolean().withMessage('is_active must be a boolean'),
  body('sort_order').optional().toInt().isInt().withMessage('sort_order must be an integer'),
];
