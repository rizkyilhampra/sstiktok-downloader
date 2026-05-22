import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createJob, deleteJob } from '../services/jobStore.js';
import { config, TIKTOK_URL_HOSTS } from '../config.js';
import { downloadQueue } from '../services/downloadQueue.js';
import { DOWNLOAD_JOB_NAME } from '../services/queueNames.js';

const router = Router();

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function isValidTikTokUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  const host = parsed.hostname.toLowerCase();
  return TIKTOK_URL_HOSTS.includes(host);
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, requestId } = req.body as { url?: string; requestId?: string };

    if (!url || typeof url !== 'string') {
      res.status(400).json({
        success: false,
        error: 'TikTok URL is required',
        errorType: 'INVALID_INPUT',
      });
      return;
    }

    if (!isValidTikTokUrl(url)) {
      res.status(400).json({
        success: false,
        error: 'Invalid TikTok URL',
        errorType: 'INVALID_URL',
        suggestion: 'Please enter a valid TikTok URL (e.g., https://www.tiktok.com/@user/video/123...)',
      });
      return;
    }

    const jobId = requestId && REQUEST_ID_RE.test(requestId) ? requestId : randomUUID();

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

    console.log('Queued job', jobId);

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
