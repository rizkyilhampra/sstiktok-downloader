import type { Job } from '../types/server.js';

export const DEFAULT_MAX_ATTEMPTS = 5;
const JOB_TTL_MS = 10 * 60 * 1000;

const jobs = new Map<string, Job>();

export function getJob(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

export function setJob(jobId: string, job: Job): void {
  jobs.set(jobId, job);
}

export function hasJob(jobId: string): boolean {
  return jobs.has(jobId);
}

export function updateJob(jobId: string, patch: Partial<Job>): void {
  const job = jobs.get(jobId);
  if (job) Object.assign(job, patch);
}

export function scheduleJobCleanup(jobId: string): void {
  const timer = setTimeout(() => jobs.delete(jobId), JOB_TTL_MS);
  // Allow Node.js to exit even if this timer is still pending
  (timer as NodeJS.Timeout).unref();
}
