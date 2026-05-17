import { Router } from 'express';
import type { Request, Response } from 'express';
import { getJob } from '../services/jobStore.js';

const router = Router();

router.get('/:jobId', async (req: Request<{ jobId: string }>, res: Response) => {
  try {
    const job = await getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: 'Job not found or expired' });
      return;
    }
    res.json(job);
  } catch (error) {
    console.error('Failed to read job:', (error as Error).message);
    res.status(503).json({ error: 'Job store is unavailable' });
  }
});

export default router;
