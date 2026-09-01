// import Redis from 'ioredis';
// import config from '@/config';
// import logger from '@/utils/logger';

// const redisConfig = {
//   host: config.redis.host,
//   port: config.redis.port,
//   password: config.redis.password || undefined,
//   keyPrefix: config.redis.keyPrefix,
//   maxRetriesPerRequest: null, // Critical requirement for BullMQ
// };

// export const redisClient = new Redis(redisConfig);

// redisClient.on('connect', () => {
//   logger.info('Redis client connected successfully');
// });

// redisClient.on('error', (err) => {
//   logger.error('Redis connection error:', err);
// });

// export const cacheService = {
//   /**
//    * Set value in cache
//    */
//   async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
//     try {
//       const stringValue = JSON.stringify(value);
//       if (ttlSeconds) {
//         await redisClient.set(key, stringValue, 'EX', ttlSeconds);
//       } else {
//         await redisClient.set(key, stringValue);
//       }
//     } catch (err) {
//       logger.error(`Redis SET error for key ${key}:`, err);
//     }
//   },

//   /**
//    * Get value from cache
//    */
//   async get<T>(key: string): Promise<T | null> {
//     try {
//       const value = await redisClient.get(key);
//       if (!value) return null;
//       return JSON.parse(value) as T;
//     } catch (err) {
//       logger.error(`Redis GET error for key ${key}:`, err);
//       return null;
//     }
//   },

//   /**
//    * Delete value from cache
//    */
//   async del(key: string): Promise<void> {
//     try {
//       await redisClient.del(key);
//     } catch (err) {
//       logger.error(`Redis DEL error for key ${key}:`, err);
//     }
//   },

//   /**
//    * Blacklist a JWT token (revocation)
//    */
//   async blacklistToken(token: string, ttlSeconds: number): Promise<void> {
//     try {
//       await redisClient.set(`blacklist:${token}`, '1', 'EX', ttlSeconds);
//     } catch (err) {
//       logger.error(`Redis blacklistToken error:`, err);
//     }
//   },

//   /**
//    * Check if a JWT token is blacklisted
//    */
//   async isTokenBlacklisted(token: string): Promise<boolean> {
//     try {
//       const exists = await redisClient.exists(`blacklist:${token}`);
//       return exists === 1;
//     } catch (err) {
//       logger.error(`Redis isTokenBlacklisted error:`, err);
//       return false;
//     }
//   },
// };
