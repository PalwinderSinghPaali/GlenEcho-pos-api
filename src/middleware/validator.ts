import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';
import logger from '@/utils/logger';

export const validate = (validations: any[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }
    console.log(errors, errors.array())
    logger.error("Validation failed", { errors: errors.array() });

    // return res.status(400).json({
    //   success: false,
    //   message: 'Validation failed',
    //   errors: errors.array()
    // });

    return res.sendError(res, 'ERR_VALIDATION_FAILED', { errors: errors.array() });
  };
};