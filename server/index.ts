import { createApp } from './app.js';
import { config } from './config.js';
import { downloadQueue } from './services/downloadQueue.js';
import { closeRedis } from './services/redis.js';

const isProduction = process.env.NODE_ENV === 'production';

const app = createApp(isProduction);

const server = app.listen(config.port, () => {
  console.log(`Server is running on http://localhost:${config.port}`);
  console.log(`Mode: ${isProduction ? 'production' : 'development'}`);
  if (!isProduction) {
    console.log('Frontend dev server should be running on http://localhost:5173');
  }
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`Received ${signal}, shutting down API server...`);
  server.close(async () => {
    try {
      await downloadQueue.close();
      await closeRedis();
      process.exit(0);
    } catch (error) {
      console.error('Error during API shutdown:', (error as Error).message);
      process.exit(1);
    }
  });
}

process.once('SIGTERM', (signal) => void shutdown(signal));
process.once('SIGINT', (signal) => void shutdown(signal));
