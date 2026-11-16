import { buildApp } from './app.js';
import { config } from './config.js';
import { connectDatabase, disconnectDatabase } from './database.js';
import { startCriticalSlotAlertJob } from './jobs/critical-slot-alerts.js';
import { logger } from './logger.js';
import { connectRedis, disconnectRedis } from './redis.js';

async function main(): Promise<void> {
  logger.info(`Starting Watodo backend in ${config.nodeEnv} mode`);

  await connectDatabase();
  try {
    await connectRedis();
  } catch (error) {
    logger.warn({ error }, 'Redis connection failed, continuing without Redis');
  }

  const app = await buildApp();

  await app.listen({
    port: config.port,
    host: config.host,
  });

  logger.info(`Server listening on http://${config.host}:${config.port}`);
  logger.info(`API documentation available at http://${config.host}:${config.port}/docs`);

  // Scheduled jobs (not started in tests, which build the app directly).
  let alertJob: NodeJS.Timeout | undefined;
  if (config.nodeEnv !== 'test') {
    alertJob = startCriticalSlotAlertJob();
  }

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    if (alertJob) clearInterval(alertJob);
    await app.close();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', error => {
    logger.error({ error }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch(error => {
  logger.fatal({ error }, 'Failed to start server');
  process.exit(1);
});
