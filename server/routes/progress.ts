import { Router } from 'express';
import type { Request, Response } from 'express';
import { registerSse, removeSse } from '../services/sseStore.js';

const router = Router();

router.get('/:requestId', (req: Request<{ requestId: string }>, res: Response) => {
  const { requestId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  res.write(`data: ${JSON.stringify({ type: 'connected', requestId })}\n\n`);

  registerSse(requestId, res);

  req.on('close', () => {
    removeSse(requestId);
    console.log(`SSE connection closed for request ${requestId}`);
  });

  console.log(`SSE connection established for request ${requestId}`);
});

export default router;
