import Redis from 'ioredis';
import { env } from './env';
import { logger } from './logger';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('error', (err) => {
  logger.error('Redis error', { message: err.message });
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

export async function connectRedis(): Promise<void> {
  try {
    await redis.connect();
  } catch (err) {
    logger.error('❌ Redis connection failed', { err: (err as Error).message });
    process.exit(1);
  }
}

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
