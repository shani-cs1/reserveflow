import express, { Express } from 'express';
import { requestLogger } from './middleware/logger.ts';
import { errorHandler } from './middleware/errorHandler.ts';
import { authRouter } from './routes/auth.ts';
import { productsRouter } from './routes/products.ts';
import { ordersRouter } from './routes/orders.ts';
import { healthRouter } from './routes/health.ts';
import { metricsRouter } from './routes/metrics.ts';
import { docsRouter } from './routes/docs.ts';
import { AuditService } from './services/auditService.ts';
import { requireAuth, requireRole } from './middleware/auth.ts';

export function createExpressApp(): Express {
  const app = express();

  // Basic security and body parser with sensible limits (1MB)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // CORS middleware
  app.use((req, res, next) => {
    const origin = process.env.CORS_ORIGIN || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Idempotency-Key, X-Request-Id'
    );
    res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // Request correlation ID and structured logger
  app.use(requestLogger);

  // Health and metrics (outside versioned API)
  app.use('/health', healthRouter);
  app.use('/metrics', metricsRouter);
  app.use('/docs', docsRouter);

  // Version 1 API routes
  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/orders', ordersRouter);

  // Audit trail endpoint for dashboard (ADMIN only)
  app.get('/api/v1/audit-events', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
    try {
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 50));
      const events = await AuditService.listRecent(limit);
      res.json(events);
    } catch (err) {
      next(err);
    }
  });

  // Global Error Handler
  app.use(errorHandler);

  return app;
}
