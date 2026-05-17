import { Redis } from 'ioredis';
import { config } from '../config.js';

const redisOptions = {
  maxRetriesPerRequest: null,
};

export const redis = createRedisConnection();

redis.on('error', (error: Error) => {
  console.error('Redis connection error:', error.message);
});

export function createRedisConnection(): Redis {
  return new Redis(config.redisUrl, redisOptions);
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
