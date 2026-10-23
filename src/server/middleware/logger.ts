import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.ts';
import { httpRequestDurationSeconds, httpRequestsTotal } from '../utils/metrics.ts';

declare global {
  namespace Express {
    interface Request {
      id: string;
      startTime: number;
      user?: {
        userId: string;
        email: string;
        role: 'ADMIN' | 'OPERATOR';
        name: string;
      };
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Generate or preserve incoming request ID
  req.id = (req.headers['x-request-id'] as string) || `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  req.startTime = Date.now();
  res.setHeader('X-Request-Id', req.id);

  // Capture finish event for duration and status
  res.on('finish', () => {
    const duration = Date.now() - req.startTime;
    const durationSec = duration / 1000;
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    const route = req.baseUrl + (req.route?.path || req.path || 'unknown');

    // Prometheus metrics
    httpRequestsTotal.inc({ route, method: req.method, status_class: statusClass });
    httpRequestDurationSeconds.observe({ route, method: req.method, status_class: statusClass }, durationSec);

    // Don't log health/metrics spam at info level
    const isProbe = req.path.startsWith('/health') || req.path.startsWith('/metrics');
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : isProbe ? 'debug' : 'info';

    logger[logLevel]({
      requestId: req.id,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
      userId: req.user?.userId || null,
      role: req.user?.role || null,
      ip: req.ip,
    });
  });

  next();
}
