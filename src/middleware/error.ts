import { Request, Response, ErrorRequestHandler, NextFunction } from "express";
import { ValidationError } from "express-validation";
import { CustomError } from "@/utils/custom-error";

const r = (
  err: ErrorRequestHandler,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (err instanceof ValidationError) {
    return res.sendError(res, "ERR_VALIDATION", err.details);
  }

  if (err instanceof CustomError) {
    return res.status(err.statusCode).json({
      success: false,
      data: null,
      error: err.serializeErrors() && err.serializeErrors().length > 0 ? err.serializeErrors()[0]?.message : err.serializeErrors(),
    });
  }

  console.error(err);
  return res.sendError(res, "ERR_INTERNAL_SERVER_ERROR");
};

export default r;
