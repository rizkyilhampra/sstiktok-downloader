import { Router } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config.js';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    maxClientConcurrentDownloads: config.maxClientConcurrentDownloads,
    maxAttempts: config.maxAttempts,
    jobTtlSeconds: config.jobTtlSeconds,
  });
});

export default router;
