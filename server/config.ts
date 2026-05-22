export const DEFAULT_MAX_ATTEMPTS = 5;

function readPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const TIKTOK_URL_HOSTS = [
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
];

export const config = {
  port: readPositiveInt('PORT', 3000),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  jobTtlSeconds: readPositiveInt('JOB_TTL_SECONDS', 10 * 60),
  maxClientConcurrentDownloads: readPositiveInt('MAX_CLIENT_CONCURRENT_DOWNLOADS', 3),
  workerConcurrency: readPositiveInt('WORKER_CONCURRENCY', 1),
  maxAttempts: DEFAULT_MAX_ATTEMPTS,
  allowedOrigins: readList('ALLOWED_ORIGINS', ['http://localhost:5173', 'http://localhost:3000']),
  rateLimitWindowMs: readPositiveInt('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitDownloadMax: readPositiveInt('RATE_LIMIT_DOWNLOAD_MAX', 10),
  rateLimitReadMax: readPositiveInt('RATE_LIMIT_READ_MAX', 240),
  maxProxyBytes: readPositiveInt('MAX_PROXY_BYTES', 200 * 1024 * 1024),
};
