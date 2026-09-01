import { body } from 'express-validator';

export const customerCreateValidator = [
  body('first_name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('First name is required'),
  body('last_name')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Last name is required'),
  body('email_primary')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address'),
  body('email_secondary')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address'),
  body('dob')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('DOB must be a valid ISO8601 date'),
  body('no_email')
    .optional()
    .isBoolean()
    .withMessage('no_email must be a boolean'),
  body('no_phone')
    .optional()
    .isBoolean()
    .withMessage('no_phone must be a boolean'),
  body('no_mail')
    .optional()
    .isBoolean()
    .withMessage('no_mail must be a boolean'),
  body('note_is_public')
    .optional()
    .isBoolean()
    .withMessage('note_is_public must be a boolean'),
];

export const customerUpdateValidator = [
  body('first_name')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('First name cannot be empty'),
  body('last_name')
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Last name cannot be empty'),
  body('email_primary')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address'),
  body('email_secondary')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Must be a valid email address'),
  body('dob')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('DOB must be a valid ISO8601 date'),
  body('no_email')
    .optional()
    .isBoolean()
    .withMessage('no_email must be a boolean'),
  body('no_phone')
    .optional()
    .isBoolean()
    .withMessage('no_phone must be a boolean'),
  body('no_mail')
    .optional()
    .isBoolean()
    .withMessage('no_mail must be a boolean'),
  body('note_is_public')
    .optional()
    .isBoolean()
    .withMessage('note_is_public must be a boolean'),
];
