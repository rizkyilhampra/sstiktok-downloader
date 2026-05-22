import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import downloadRouter from './routes/download.js';
import jobsRouter from './routes/jobs.js';
import proxyDownloadRouter from './routes/proxyDownload.js';
import healthRouter from './routes/health.js';
import configRouter from './routes/config.js';
import { config } from './config.js';

export function createApp(isProduction: boolean): express.Application {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: isProduction ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: isProduction ? config.allowedOrigins : true,
      credentials: false,
    }),
  );
  app.use(express.json({ limit: '16kb' }));
  app.use(express.urlencoded({ extended: true, limit: '16kb' }));

  const downloadLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitDownloadMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many download requests, please slow down.',
      errorType: 'RATE_LIMITED',
    },
  });

  const readLimiter = rateLimit({
    windowMs: config.rateLimitWindowMs,
    limit: config.rateLimitReadMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      success: false,
      error: 'Too many requests, please slow down.',
      errorType: 'RATE_LIMITED',
    },
  });

  if (isProduction) {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
  }

  app.use('/api/download', downloadLimiter, downloadRouter);
  app.use('/api/jobs', readLimiter, jobsRouter);
  app.use('/api/proxy-download', readLimiter, proxyDownloadRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/config', configRouter);

  if (isProduction) {
    app.get('*path', (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  return app;
}
