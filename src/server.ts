import app from './app';
import config from '@/config';
import sequelize from '@/database/connection';
import { setupAssociations } from '@/database/models';
import { LightspeedQueue } from '@/services/lightspeed-queue';
// import { redisClient } from '@/cache/redis';
// import { startWorkers, stopWorkers } from '@/jobs/index';
import logger from '@/utils/logger';
import { Server } from 'http';

let server: Server;

const connectToDb = async (): Promise<void> => {
   await sequelize.sync({ force: false })
  try {
    await sequelize.authenticate();
    logger.info('Database Connected successfully.');
    setupAssociations();
    
    // Sync database (in production, use migrations)
    if (process.env.NODE_ENV === 'development') {
      await sequelize.sync({ alter: true });
      logger.info('Database synced');
    }
  } catch (error) {
    logger.error('Unable to start server:', error);
    console.error('Unable to start server:', error);
    process.exit(1);
  }
};

async function bootstrap() {
  logger.info('Initializing application bootstrap...');

  // 1. Verify Database Connection
  await connectToDb();

  // 2. Verify Redis Connection
  // if (redisClient.status !== 'ready' && redisClient.status !== 'connecting') {
  //   logger.error('Redis client failed to connect. Aborting startup.');
  //   process.exit(1);
  // }

  // 3. Start background job workers
  LightspeedQueue.startWorker();

  // 4. Start Server Listener
  const port = config.app.port;
  server = app.listen(port, () => {
    logger.info(`Server started in [${config.app.env}] mode on port: ${port}`);
    logger.info(`App API URL: http://${config.app.host}:${port}${config.app.prefix}/${config.app.version}`);
  });

  // 5. Handle Graceful Shutdown signals
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    
    // Set timeout to force exit if shutdown takes too long
    const forceExitTimeout = setTimeout(() => {
      logger.error('Forceful shutdown triggered. Exiting immediately.');
      process.exit(1);
    }, 10000);

    if (server) {
      server.close(() => {
        logger.info('HTTP server closed.');
      });
    }

    try {
      // Stop workers
      LightspeedQueue.stopWorker();

      // Disconnect Redis
      // logger.info('Disconnecting Redis...');
      // await redisClient.quit();
      // logger.info('Redis disconnected.');

      // Disconnect Database
      logger.info('Closing database connections...');
      await sequelize.close();
      logger.info('Database connections closed.');

      clearTimeout(forceExitTimeout);
      logger.info('Graceful shutdown completed successfully. Exiting.');
      process.exit(0);
    } catch (err) {
      logger.error('Error encountered during graceful shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  logger.error('Fatal error during application startup:', err);
  process.exit(1);
});
