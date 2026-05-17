import { Queue } from 'bullmq';
import { createRedisConnection } from './redis.js';
import { DOWNLOAD_QUEUE_NAME } from './queueNames.js';

export interface DownloadQueueData {
  jobId: string;
  url: string;
}

export const downloadQueue = new Queue<DownloadQueueData>(DOWNLOAD_QUEUE_NAME, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
});
