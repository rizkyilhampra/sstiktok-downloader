export const DEFAULT_MAX_ATTEMPTS = 5;

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export const config = {
  port: readPositiveInt('PORT', 3000),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jobTtlSeconds: readPositiveInt('JOB_TTL_SECONDS', 10 * 60),
  maxClientConcurrentDownloads: readPositiveInt('MAX_CLIENT_CONCURRENT_DOWNLOADS', 3),
  workerConcurrency: readPositiveInt('WORKER_CONCURRENCY', 1),
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
};
