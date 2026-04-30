import { Router } from 'express';
import type { Request, Response } from 'express';
import { hasJob, setJob, DEFAULT_MAX_ATTEMPTS } from '../services/jobStore.js';
import { runDownloadJob } from '../services/downloadJob.js';

const router = Router();

router.post('/', (req: Request, res: Response) => {
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

  if (hasJob(jobId)) {
    console.log('Idempotent reuse of existing job', jobId);
    res.json({ jobId, maxAttempts: DEFAULT_MAX_ATTEMPTS });
    return;
  }

  setJob(jobId, {
    id: jobId,
    status: 'processing',
    attempt: 1,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
    createdAt: Date.now(),
    finishedAt: null,
  });

  console.log('Starting job', jobId, 'for URL:', url);
  void runDownloadJob(jobId, url).catch((err: unknown) => {
    console.error('Unhandled job error:', err);
  });

  res.json({ jobId, maxAttempts: DEFAULT_MAX_ATTEMPTS });
});

export default router;
