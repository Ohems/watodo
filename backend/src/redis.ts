import { Redis } from 'ioredis';
import { config } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('redis');

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err: Error) => logger.error({ error: err }, 'Redis error'));
  }
  return client;
}

export async function connectRedis(): Promise<void> {
  const redis = getRedisClient();
  await redis.connect();
}

export async function disconnectRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    logger.info('Redis disconnected');
  }
}
