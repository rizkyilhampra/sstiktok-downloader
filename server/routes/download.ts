import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { createJob, getJob } from '../services/jobStore.js';
import { config, TIKTOK_SHORT_URL_HOSTS, TIKTOK_URL_HOSTS } from '../config.js';
import { downloadQueue } from '../services/downloadQueue.js';
import { DOWNLOAD_JOB_NAME } from '../services/queueNames.js';

const router = Router();

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

async function repairExistingJob(jobId: string, fallbackUrl: string): Promise<boolean> {
  const existing = await getJob(jobId);
  if (!existing) return false;
  if (existing.status === 'queued' && !await downloadQueue.getJob(jobId)) {
    await downloadQueue.add(DOWNLOAD_JOB_NAME, { jobId, url: existing.requestedUrl ?? fallbackUrl }, { jobId });
  }
  return true;
}

function isValidTikTokUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  if (parsed.username || parsed.password || parsed.port) return false;

  const host = parsed.hostname.toLowerCase();
  if (TIKTOK_SHORT_URL_HOSTS.includes(host)) {
    return parsed.protocol === 'https:' && /^\/t\/[A-Za-z0-9]+\/?$/.test(parsed.pathname);
  }
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

    const jobId = typeof requestId === 'string' && REQUEST_ID_RE.test(requestId) ? requestId : randomUUID();

    const created = await createJob(jobId, {
      id: jobId,
      requestedUrl: url,
      status: 'queued',
      attempt: 1,
      maxAttempts: config.maxAttempts,
      createdAt: Date.now(),
      finishedAt: null,
    });

    if (!created) {
      if (!await repairExistingJob(jobId, url)) {
        res.status(503).json({
          success: false,
          error: 'Download job is unavailable',
          errorType: 'NETWORK_ERROR',
          suggestion: 'Try again in a moment.',
        });
        return;
      }
      console.log('Idempotent reuse of existing job', jobId);
      res.json({ jobId, maxAttempts: config.maxAttempts });
      return;
    }

    // Keep the Redis reservation on enqueue failure so a retry with the same
    // request ID can add the missing BullMQ job after a crash or Redis outage.
    await downloadQueue.add(DOWNLOAD_JOB_NAME, { jobId, url }, { jobId });

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
