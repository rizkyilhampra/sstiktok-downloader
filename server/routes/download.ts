import { Router } from 'express';
import type { Request, Response } from 'express';
import { createJob, deleteJob } from '../services/jobStore.js';
import { config } from '../config.js';
import { downloadQueue } from '../services/downloadQueue.js';
import { DOWNLOAD_JOB_NAME } from '../services/queueNames.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, requestId } = req.body as { url?: string; requestId?: string };

    if (!url) {
      res.status(400).json({
        success: false,
        error: 'TikTok URL is required',
        errorType: 'INVALID_INPUT',
      });
      return;
    }

    if (!url.includes('tiktok.com')) {
      res.status(400).json({
        success: false,
        error: 'Invalid TikTok URL',
        errorType: 'INVALID_URL',
        suggestion: 'Please enter a valid TikTok URL (e.g., https://www.tiktok.com/@user/video/123...)',
      });
      return;
    }

    const jobId = requestId ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const created = await createJob(jobId, {
      id: jobId,
      status: 'queued',
      attempt: 1,
      maxAttempts: config.maxAttempts,
      createdAt: Date.now(),
      finishedAt: null,
    });

    if (!created) {
      console.log('Idempotent reuse of existing job', jobId);
      res.json({ jobId, maxAttempts: config.maxAttempts });
      return;
    }

    try {
      await downloadQueue.add(DOWNLOAD_JOB_NAME, { jobId, url }, { jobId });
    } catch (error) {
      await deleteJob(jobId);
      throw error;
    }

    console.log('Queued job', jobId, 'for URL:', url);

    res.json({ jobId, maxAttempts: config.maxAttempts });
  } catch (error) {
    console.error('Failed to queue job:', (error as Error).message);
    res.status(503).json({
      success: false,
      error: 'Download queue is unavailable',
      errorType: 'NETWORK_ERROR',
      suggestion: 'Try again in a moment.',
    });
  }
});

export default router;
