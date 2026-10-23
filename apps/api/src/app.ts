import Fastify, { LogController, type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Config } from './config.js';
import { AppError } from './errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    startTime: bigint;
    userId: string | null; // set by the auth layer in a later step
  }
}

export interface AppDeps {
  config: Config;
  pool: pg.Pool;
}

// Only accept a client-supplied request ID if it is short and boring (prevents log injection).
const SAFE_REQUEST_ID = /^[A-Za-z0-9_-]{1,64}$/;

export async function buildApp({ config, pool }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      // Safety net: even if a header/body is ever logged, these are masked.
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
        censor: '[REDACTED]',
      },
      formatters: { level: (label) => ({ level: label }) },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    },
    // We write one structured line per request ourselves (the onResponse hook below),
    // so Fastify's default request logs are off. The request ID is logged as `requestId`.
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)
        ? incoming
        : `req_${randomUUID()}`;
    },
    bodyLimit: 100 * 1024, // 100 KB request bodies
    forceCloseConnections: 'idle', // lets graceful shutdown close idle keep-alive sockets
  });

  await app.register(cors, { origin: config.CORS_ORIGINS });

  app.decorateRequest('startTime', 0n);
  app.decorateRequest('userId', null);

  app.addHook('onRequest', async (request) => {
    request.startTime = process.hrtime.bigint();
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  // One structured log line per request. Never log headers or bodies here.
  app.addHook('onResponse', async (request, reply) => {
    const durationMs = Number(process.hrtime.bigint() - request.startTime) / 1e6;
    request.log.info(
      {
        method: request.method,
        // Route TEMPLATE (e.g. /orders/:id), not the raw URL: safe and low-cardinality.
        route: request.routeOptions.url ?? 'unmatched',
        status: reply.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: request.userId,
      },
      'request completed',
    );
  });

  // ---- Error handling: every error leaves the API in the same envelope ----
  const envelope = (requestId: string, code: string, message: string, details?: unknown) => ({
    error: { code, message, details: details ?? null, requestId },
  });

  app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send(envelope(request.id, err.code, err.message, err.details));
    }
    const fastifyErr = err as FastifyError;
    if (fastifyErr.validation) {
      return reply
        .status(400)
        .send(
          envelope(
            request.id,
            'VALIDATION_ERROR',
            'Request validation failed',
            fastifyErr.validation,
          ),
        );
    }
    if (fastifyErr.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply
        .status(413)
        .send(envelope(request.id, 'PAYLOAD_TOO_LARGE', 'Request body is too large'));
    }
    const status = fastifyErr.statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(envelope(request.id, 'BAD_REQUEST', fastifyErr.message));
    }
    // Unknown error: log the details server-side, tell the client nothing internal.
    request.log.error({ err }, 'unhandled error');
    return reply
      .status(500)
      .send(envelope(request.id, 'INTERNAL_ERROR', 'An unexpected error occurred'));
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(envelope(request.id, 'NOT_FOUND', 'Route not found'));
  });

  // ---- Health ----
  app.get('/health/live', async () => ({ status: 'ok' }));

  app.get('/health/ready', async (request) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready' };
    } catch (err) {
      request.log.error({ err }, 'readiness check failed');
      throw new AppError(503, 'NOT_READY', 'Database is not reachable');
    }
  });

  return app;
}
