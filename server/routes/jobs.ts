import { Router } from 'express';
import type { Request, Response } from 'express';
import { getJob } from '../services/jobStore.js';

const router = Router();

router.get('/:jobId', (req: Request<{ jobId: string }>, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Job not found or expired' });
    return;
  }
  res.json(job);
});

export default router;
