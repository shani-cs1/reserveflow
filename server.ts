import { createServer } from 'http';
import { createExpressApp } from './src/server/app.ts';
import { initDatabase, closeDatabase } from './src/server/db/index.ts';
import { seedDatabase } from './src/server/db/seed.ts';
import { logger } from './src/server/utils/logger.ts';
import { config } from './src/server/config.ts';
import path from 'path';
import express from 'express';

async function startServer() {
  const isProduction = config.NODE_ENV === 'production';
  const port = config.PORT || 3000;

  // 1. Initialize database and optionally seed demo data in non-production environments
  try {
    await initDatabase();

    if (config.DEMO_SEED && !isProduction) {
      await seedDatabase();
      logger.info({ msg: 'Demo seed enabled via DEMO_SEED=true' });
    }
  } catch (dbErr) {
    logger.error({ err: dbErr, msg: 'Error initializing database during startup' });
  }

  // 2. Create Express App
  const app = createExpressApp();

  // 3. Attach Vite dev server or static files
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = createServer(app);

  server.listen(port, '0.0.0.0', () => {
    logger.info({
      msg: `ReserveFlow server running on http://0.0.0.0:${port}`,
      env: config.NODE_ENV,
      port,
      apiDocs: `http://localhost:${port}/docs`,
      health: `http://localhost:${port}/health/ready`,
      metrics: `http://localhost:${port}/metrics`,
    });
  });

  // 4. Graceful shutdown handler
  const shutdown = async (signal: string) => {
    logger.info({ signal, msg: `Received ${signal}, initiating graceful shutdown...` });

    server.close(async () => {
      logger.info({ msg: 'HTTP server closed. Closing database connections...' });
      try {
        await closeDatabase();
        logger.info({ msg: 'Database connections successfully terminated. Bye.' });
        process.exit(0);
      } catch (err) {
        logger.error({ err, msg: 'Error while closing database during shutdown' });
        process.exit(1);
      }
    });

    // Force termination if bounded timeout expires (10 seconds)
    setTimeout(() => {
      logger.error({ msg: 'Graceful shutdown timed out after 10s. Forcing exit.' });
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
