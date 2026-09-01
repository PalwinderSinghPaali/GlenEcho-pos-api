import { Request, Response, NextFunction } from 'express';

/**
 * Reusable lightweight middleware to parse client cookies and attach them to req.cookies
 */
export const cookieParser = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const cookieHeader = req.headers.cookie;
  const cookies: Record<string, string> = {};

  if (cookieHeader) {
    // Parse cookie string: "key1=val1; key2=val2"
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        cookies[key] = decodeURIComponent(value);
      }
    });
  }

  req.cookies = cookies;
  next();
};
