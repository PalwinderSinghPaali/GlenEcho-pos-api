import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import config from '@/config';
import { cookieParser } from '@/middleware/cookie-parser';
import { apiRateLimiter, apiSpeedLimiter } from '@/middleware/rate-limiter';
import { NotFoundError } from '@/utils/custom-error';
import authRouter from '@/router/auth';
import roleRouter from '@/router/role';
import lightspeedRouter from '@/router/lightspeed';
import categoryRouter from '@/router/category';
import vendorRouter from '@/router/vendor';
import brandRouter from '@/router/brand';
import inventoryRouter from '@/router/inventory';
import productRouter from '@/router/product';
import tagRouter from '@/router/tag';
import customerRouter from '@/router/customer';
import contactRouter from '@/router/contact';
import homepageBannerRouter from '@/router/homepage-banner';
import priceLevelRouter from '@/router/price-level';
import currencyRateRouter from '@/router/currency-rate';
import discountRouter from '@/router/discount';
import customerTypeRouter from '@/router/customer-type';
import taxCategoryRouter from '@/router/tax-category';
import checkoutRouter from '@/router/checkout';
import orderRouter from '@/router/order';
import registerRouter from '@/router/register';
import employeeRouter from '@/router/employee';
import sequelize from '@/database/connection';

// import { redisClient } from '@/cache/redis';
import setInterface from '@/middleware/interface';
import logging from "@/middleware/logging";
import errorMiddleware from "@/middleware/error";

const app: Express = express();

// Disable X-Powered-By header for security
app.disable('x-powered-by');

// 2. Global Security and Parsing Middlewares
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  cors({
    origin: config.app.corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);
app.use(compression());
app.use(
  express.json({
    limit: '10mb',
    verify: (req: any, _res, buf) => {
      if (req.originalUrl.includes('/webhook')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser);

app.use(setInterface);
// Logging
app.use(logging);

// 3. Rate Limiting and Speed Limiting (Global Application)
if (config.app.env === 'production') {
  app.use(apiRateLimiter);
  app.use(apiSpeedLimiter);
}

// 4. Health Check Route (Database, Redis, Memory, Uptime check)
app.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let dbStatus = 'UP';
    try {
      await sequelize.authenticate();
    } catch (err) {
      dbStatus = 'DOWN';
    }

    // const redisStatus = redisClient.status === 'ready' ? 'UP' : 'DOWN';
    
    // Memory and performance details
    const memoryUsage = process.memoryUsage();
    const systemHealth = {
      // status: dbStatus === 'UP' && redisStatus === 'UP' ? 'healthy' : 'degraded',
      status: dbStatus === 'UP' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
      version: config.app.version,
      environment: config.app.env,
      services: {
        database: dbStatus,
        // redis: redisStatus,
      },
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      },
    };

    const statusCode = systemHealth.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(systemHealth);
  } catch (error) {
    next(error);
  }
});

// 5. Versioned API Routes Mounting
app.use(`${config.app.prefix}/${config.app.version}/auth`, authRouter);
app.use(`${config.app.prefix}/${config.app.version}/role`, roleRouter);
app.use(`${config.app.prefix}/${config.app.version}/lightspeed`, lightspeedRouter);
app.use(`${config.app.prefix}/${config.app.version}/category`, categoryRouter);
app.use(`${config.app.prefix}/${config.app.version}/vendor`, vendorRouter);
app.use(`${config.app.prefix}/${config.app.version}/brand`, brandRouter);
app.use(`${config.app.prefix}/${config.app.version}/inventory`, inventoryRouter);
app.use(`${config.app.prefix}/${config.app.version}/product`, productRouter);
app.use(`${config.app.prefix}/${config.app.version}/tag`, tagRouter);
app.use(`${config.app.prefix}/${config.app.version}/customer`, customerRouter);
app.use(`${config.app.prefix}/${config.app.version}/contact`, contactRouter);
app.use(`${config.app.prefix}/${config.app.version}/homepage-banners`, homepageBannerRouter);
app.use(`${config.app.prefix}/${config.app.version}/price-level`, priceLevelRouter);
app.use(`${config.app.prefix}/${config.app.version}/currency-rate`, currencyRateRouter);
app.use(`${config.app.prefix}/${config.app.version}/discount`, discountRouter);
app.use(`${config.app.prefix}/${config.app.version}/customer-type`, customerTypeRouter);
app.use(`${config.app.prefix}/${config.app.version}/tax-category`, taxCategoryRouter);
app.use(`${config.app.prefix}/${config.app.version}/checkout`, checkoutRouter);
app.use(`${config.app.prefix}/${config.app.version}/orders`, orderRouter);
app.use(`${config.app.prefix}/${config.app.version}/register`, registerRouter);
app.use(`${config.app.prefix}/${config.app.version}/employee`, employeeRouter);


// 6. Handle Route Not Found Errors
app.use((req: Request, _res: Response, next: NextFunction) => {
  next(new NotFoundError(`Cannot ${req.method} ${req.path}`));
});

// 7. Centralized Error Handling Middleware
app.use(errorMiddleware);

export default app;
