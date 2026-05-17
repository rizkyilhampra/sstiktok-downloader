import type { Job } from '../types/server.js';
import { config } from '../config.js';
import { redis } from './redis.js';
import { getErrorResponse } from '../utils/errors.js';

const jobKey = (jobId: string) => `job:${jobId}`;

export async function getJob(jobId: string): Promise<Job | undefined> {
  const raw = await redis.get(jobKey(jobId));
  if (!raw) return undefined;
  return JSON.parse(raw) as Job;
}

export async function createJob(jobId: string, job: Job): Promise<boolean> {
  const result = await redis.set(jobKey(jobId), JSON.stringify(job), 'EX', config.jobTtlSeconds, 'NX');
  return result === 'OK';
}

async function setJob(jobId: string, job: Job): Promise<void> {
  await redis.set(jobKey(jobId), JSON.stringify(job), 'EX', config.jobTtlSeconds);
}

export async function updateJob(jobId: string, patch: Partial<Job>): Promise<boolean> {
  const job = await getJob(jobId);
  if (!job) return false;
  await setJob(jobId, { ...job, ...patch });
  return true;
}

export async function deleteJob(jobId: string): Promise<void> {
  await redis.del(jobKey(jobId));
}

export async function failJob(jobId: string, error: unknown): Promise<void> {
  const errorInfo = getErrorResponse(error);
  await updateJob(jobId, {
    status: 'failed',
    finishedAt: Date.now(),
    retryDelay: undefined,
    error: errorInfo.message,
    errorType: errorInfo.errorType,
    suggestion: errorInfo.suggestion,
  });
}
