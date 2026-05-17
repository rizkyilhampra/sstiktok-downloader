import express from 'express';
import cors from 'cors';
import path from 'path';
import downloadRouter from './routes/download.js';
import jobsRouter from './routes/jobs.js';
import proxyDownloadRouter from './routes/proxyDownload.js';
import healthRouter from './routes/health.js';
import configRouter from './routes/config.js';

export function createApp(isProduction: boolean): express.Application {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  if (isProduction) {
    // process.cwd() is always the project root, regardless of where the compiled
    // server file lives (dist/server/ in prod vs server/ in dev).
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
  }

  app.use('/api/download', downloadRouter);
  app.use('/api/jobs', jobsRouter);
  app.use('/api/proxy-download', proxyDownloadRouter);
  app.use('/api/health', healthRouter);
  app.use('/api/config', configRouter);

  if (isProduction) {
    app.get('*path', (_req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  return app;
}
