import { Worker } from 'bullmq';
import { config } from './config.js';
import { DOWNLOAD_QUEUE_NAME } from './services/queueNames.js';
import { closeRedis, createRedisConnection } from './services/redis.js';
import { runDownloadJob } from './services/downloadJob.js';
import { failJob } from './services/jobStore.js';

const worker = new Worker(
  DOWNLOAD_QUEUE_NAME,
  async (job) => {
    await runDownloadJob(job.data.jobId, job.data.url);
  },
  {
    connection: createRedisConnection(),
    concurrency: config.workerConcurrency,
  },
);

worker.on('completed', (job) => {
  console.log(`Worker finished queue job for ${job.data.jobId}`);
});

worker.on('failed', (job, error) => {
  console.error(`Unexpected worker failure for ${job?.data.jobId ?? 'unknown'}:`, error.message);
  if (job) {
    void failJob(job.data.jobId, error).catch((updateError: unknown) => {
      console.error('Failed to update worker failure state:', (updateError as Error).message);
    });
  }
});

console.log(`Download worker started with concurrency ${config.workerConcurrency}`);

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`Received ${signal}, shutting down download worker...`);
  try {
    await worker.close();
    await closeRedis();
    process.exit(0);
  } catch (error) {
    console.error('Error during worker shutdown:', (error as Error).message);
    process.exit(1);
  }
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
