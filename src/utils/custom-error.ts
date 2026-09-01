export abstract class CustomError extends Error {
  abstract readonly statusCode: number;

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }

  abstract serializeErrors(): { message: string; field?: string }[];
}

export class BadRequestError extends CustomError {
  readonly statusCode = 400;

  constructor(public message: string) {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

export class UnauthorizedError extends CustomError {
  readonly statusCode = 401;

  constructor(public message: string = 'Not Authorized') {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

export class ForbiddenError extends CustomError {
  readonly statusCode = 403;

  constructor(public message: string = 'Access Denied') {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

export class NotFoundError extends CustomError {
  readonly statusCode = 404;

  constructor(public message: string = 'Route or Resource Not Found') {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

export class ConflictError extends CustomError {
  readonly statusCode = 409;

  constructor(public message: string) {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

export class AppValidationError extends CustomError {
  readonly statusCode = 422;

  constructor(public errors: { message: string; field?: string }[]) {
    super('Validation failed');
  }

  serializeErrors() {
    return this.errors;
  }
}

export class RateLimitError extends CustomError {
  readonly statusCode = 429;

  constructor(public message: string = 'Too many requests, please try again later.') {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}

export class InternalServerError extends CustomError {
  readonly statusCode = 500;

  constructor(public message: string = 'Something went wrong') {
    super(message);
  }

  serializeErrors() {
    return [{ message: this.message }];
  }
}
