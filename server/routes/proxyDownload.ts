import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Readable } from 'stream';
import axios from 'axios';
import { getJob } from '../services/jobStore.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { jobId, filename } = req.query as { jobId?: string; filename?: string };

  if (!jobId) {
    res.status(400).json({ error: 'jobId is required' });
    return;
  }

  let job;
  try {
    job = await getJob(jobId);
  } catch (error) {
    console.error('Failed to read job for proxy download:', (error as Error).message);
    res.status(503).json({ error: 'Job store is unavailable' });
    return;
  }
  if (!job || job.status !== 'completed' || !job.downloadUrl) {
    res.status(400).json({ error: 'Job not found, not completed, or has no download URL' });
    return;
  }

  const url = job.downloadUrl;
  const finalFilename = filename || job.filename || 'tiktok-video.mp4';
  console.log('Proxying download from:', url);
  console.log('Using filename:', finalFilename);

  const upstreamHeaders: Record<string, string> = {
    Referer: 'https://ssstik.io/',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  };
  if (req.headers.range) {
    upstreamHeaders.Range = req.headers.range;
  }

  let upstream;
  try {
    upstream = await axios.get<Readable>(url, {
      responseType: 'stream',
      timeout: 30_000,
      headers: upstreamHeaders,
      validateStatus: (status) => status >= 200 && status < 400,
    });
  } catch (error) {
    console.error('Error proxying download:', (error as Error).message);
    res.status(502).json({
      error: 'Failed to download video',
      message: (error as Error).message,
    });
    return;
  }

  const stream: Readable = upstream.data;
  const cleanup = () => {
    if (!stream.destroyed) stream.destroy();
  };

  stream.on('error', (err: Error) => {
    console.error('upstream stream error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Upstream stream error', message: err.message });
    } else {
      res.destroy(err);
    }
  });
  res.on('error', (err: Error) => {
    console.error('response stream error:', err.message);
    cleanup();
  });
  req.on('close', cleanup);

  res.status(upstream.status);
  res.setHeader('Content-Type', String(upstream.headers['content-type'] ?? 'video/mp4'));
  res.setHeader('Content-Disposition', `attachment; filename="${finalFilename}"`);
  res.setHeader('Accept-Ranges', String(upstream.headers['accept-ranges'] ?? 'bytes'));
  const contentLength = upstream.headers['content-length'];
  if (contentLength !== undefined) {
    res.setHeader('Content-Length', String(contentLength));
  }
  const contentRange = upstream.headers['content-range'];
  if (contentRange !== undefined) {
    res.setHeader('Content-Range', String(contentRange));
  }

  stream.pipe(res);
});

export default router;
