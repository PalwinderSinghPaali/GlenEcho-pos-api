import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RedisStore from 'rate-limit-redis';
// import { redisClient } from '@/cache/redis';
import config from '@/config';
import { RateLimitError } from '@/utils/custom-error';
import logger from '@/utils/logger';

// Create Redis store for rate limiter
let rateLimitStore: unknown = undefined;

// try {
//   rateLimitStore = new RedisStore({
//     // @ts-expect-error - ioredis compatibility
//     sendCommand: (...args: string[]) => {
//       if (redisClient.status === 'ready') {
//         return redisClient.call(args[0], ...args.slice(1));
//       }
//       throw new Error('Redis not ready');
//     },
//   });
// } catch (error) {
//   logger.warn('Failed to initialize Redis store for rate limiting, falling back to memory store:', error);
// }

// Central API Rate Limiter
export const apiRateLimiter = rateLimit({
//   store: rateLimitStore as never, // will fallback to memory if undefined
  windowMs: config.app.rateLimit.windowMs,
  max: config.app.rateLimit.max,
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res, next) => {
    next(new RateLimitError());
  },
});

// Speed Limiter (Slow Down Middleware)
// Delays requests after hitting a threshold rather than outright blocking them
export const apiSpeedLimiter = slowDown({
  windowMs: config.app.slowDown.windowMs,
  delayAfter: config.app.slowDown.delayAfter,
  delayMs: () => config.app.slowDown.delayMs,
});

// Stricter Rate Limiter for Authentication routes (Brute force protection)
export const authRateLimiter = rateLimit({
  store: rateLimitStore as never,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login/register requests per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new RateLimitError('Too many authentication attempts, please try again in 15 minutes.'));
  },
});

// Stricter Rate Limiter for Contact Form Submissions to prevent spamming
export const contactRateLimiter = rateLimit({
  store: rateLimitStore as never,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // limit each IP to 3 submissions per window
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new RateLimitError('Too many contact form submissions. Please wait 15 minutes before trying again.'));
  },
});

