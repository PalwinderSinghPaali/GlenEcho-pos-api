import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const requiredEnvVars = [
  'NODE_ENV',
  'PORT',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'REDIS_HOST',
  'REDIS_PORT',
  'LIGHTSPEED_CLIENT_ID',
  'LIGHTSPEED_CLIENT_SECRET',
  'LIGHTSPEED_REFRESH_TOKEN',
  'LIGHTSPEED_ACCOUNT_ID'
];

const missingEnvVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `FATAL CONFIGURATION ERROR: The following required environment variables are missing: \n${missingEnvVars.join(
      '\n'
    )}\nApplication startup aborted.`
  );
}

export interface Config {
  app: {
    env: string;
    port: number;
    prefix: string;
    version: string;
    name: string;
    host: string;
    corsOrigin: string[];
    rateLimit: {
      windowMs: number;
      max: number;
    };
    slowDown: {
      windowMs: number;
      delayAfter: number;
      delayMs: number;
    };
    cookie: {
      sameSite: 'strict' | 'lax' | 'none';
      secure: boolean;
    };
  };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessExpiry: string;
    refreshExpiry: string;
    saltRounds: number;
  };
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    logging: boolean;
    readHosts: string[];
    writeHost: string;
    pool: {
      max: number;
      min: number;
      acquire: number;
      idle: number;
    };
  };
  redis: {
    host: string;
    port: number;
    password: string | null;
    keyPrefix: string;
  };
  lightspeed: {
    apiUrl: string;
    oauthUrl: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accountId: string;
    redirectUri?: string;
    /**
     * Startup default for read-only mode.
     * The live source of truth is the `read_only_mode` column in the
     * `lightspeed_configs` DB table, which can be toggled at runtime via API.
     */
    readOnlyMode: boolean;
    defaultRegisterId?: string;
    defaultEmployeeId?: string;
    defaultShopId?: string;
  };
  mail: {
    host: string;
    port: number;
    user: string | undefined;
    pass: string | undefined;
    from: string;
  };
  stripe: {
    secretKey: string | undefined;
    webhookSecret: string | undefined;
  };
  aws: {
    accessKeyId: string | undefined;
    secretAccessKey: string | undefined;
    region: string;
    bucketName: string | undefined;
  };
  logger: {
    level: string;
    filePath: string;
  };
}

const config: Config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '5000', 10),
    prefix: process.env.API_PREFIX || '/api',
    version: process.env.API_VERSION || 'v1',
    name: process.env.APP_NAME || 'POS_Ecommerce_Backend',
    host: process.env.APP_HOST || 'localhost',
    corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
    slowDown: {
      windowMs: parseInt(process.env.SLOW_DOWN_WINDOW_MS || '900000', 10),
      delayAfter: parseInt(process.env.SLOW_DOWN_DELAY_AFTER || '50', 10),
      delayMs: parseInt(process.env.SLOW_DOWN_DELAY_MS || '500', 10),
    },
    cookie: {
      sameSite: (process.env.COOKIE_SAME_SITE as 'strict' | 'lax' | 'none') || 'strict',
      secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production',
    }
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET!,
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS || '12', 10),
  },
  db: {
    host: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    name: process.env.DB_NAME!,
    logging: process.env.DB_LOGGING === 'true',
    readHosts: process.env.DB_READ_HOSTS ? process.env.DB_READ_HOSTS.split(',') : [process.env.DB_HOST!],
    writeHost: process.env.DB_WRITE_HOST || process.env.DB_HOST!,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      min: parseInt(process.env.DB_POOL_MIN || '5', 10),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
    },
  },
  redis: {
    host: process.env.REDIS_HOST!,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || null,
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'pos_app:',
  },
  lightspeed: {
    apiUrl: process.env.LIGHTSPEED_API_URL || 'https://api.lightspeedapp.com/API/V3',
    oauthUrl: process.env.LIGHTSPEED_OAUTH_URL || 'https://cloud.lightspeedapp.com/auth/oauth/token',
    clientId: process.env.LIGHTSPEED_CLIENT_ID!,
    clientSecret: process.env.LIGHTSPEED_CLIENT_SECRET!,
    refreshToken: process.env.LIGHTSPEED_REFRESH_TOKEN!,
    accountId: process.env.LIGHTSPEED_ACCOUNT_ID!,
    redirectUri: process.env.LIGHTSPEED_REDIRECT_URI,
    // Default to true (read-only) unless explicitly set to 'false' in env.
    // DB value overrides this at runtime — see LightspeedConfig.read_only_mode.
    readOnlyMode: process.env.LIGHTSPEED_READ_ONLY !== 'false',
    defaultRegisterId: process.env.LIGHTSPEED_DEFAULT_REGISTER_ID,
    defaultEmployeeId: process.env.LIGHTSPEED_DEFAULT_EMPLOYEE_ID,
    defaultShopId: process.env.LIGHTSPEED_DEFAULT_SHOP_ID,
  },
  mail: {
    host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'no-reply@ecommerce.com',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucketName: process.env.AWS_S3_BUCKET_NAME,
  },
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    filePath: process.env.LOG_FILE_PATH || 'logs/app.log',
  },
};

export default config;
