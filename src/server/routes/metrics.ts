import { Router, Request, Response, NextFunction } from 'express';
import { getContentType, getMetrics } from '../utils/metrics.ts';
import { config } from '../config.ts';
import { AuthenticationError, ForbiddenError } from '../utils/errors.ts';
import { AuthService } from '../services/authService.ts';

export const metricsRouter = Router();

metricsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null;

    if (config.METRICS_TOKEN) {
      // Monitoring token mode: accept the dedicated token via bearer header or query parameter.
      const queryToken = req.query.token as string | undefined;

      if (bearerToken !== config.METRICS_TOKEN && queryToken !== config.METRICS_TOKEN) {
        throw new AuthenticationError('Invalid metrics access token');
      }
    } else {
      // Fail closed: without a metrics token, only authenticated ADMINs may scrape metrics.
      if (!bearerToken) {
        throw new AuthenticationError('Metrics access requires authentication');
      }

      const user = AuthService.verifyToken(bearerToken);
      if (user.role !== 'ADMIN') {
        throw new ForbiddenError('Metrics access requires the ADMIN role');
      }
    }

    res.setHeader('Content-Type', getContentType());
    const metrics = await getMetrics();
    res.send(metrics);
  } catch (err) {
    next(err);
  }
});
