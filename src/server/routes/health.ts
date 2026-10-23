import { Router, Request, Response } from 'express';
import { getDatabase } from '../db/index.ts';
import { sql } from 'drizzle-orm';
import { logger } from '../utils/logger.ts';

export const healthRouter = Router();

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    // Test database query
    await db.execute(sql`SELECT 1`);

    res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err, msg: 'Readiness probe failed: database check did not succeed' });
    res.status(503).json({
      status: 'unready',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});
