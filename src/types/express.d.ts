import 'express';
import { UserAuthPayload } from './user';

declare module 'express' {
  export interface Response {
    errorMessage?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: UserAuthPayload;
      token?: string;
      cookies?: Record<string, string>;
    }
  }
}