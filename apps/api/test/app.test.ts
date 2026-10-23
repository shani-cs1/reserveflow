import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { AppError } from '../src/errors.js';
import { testDatabaseUrl, validEnv } from './helpers.js';

const config = loadConfig(validEnv);
let pool: pg.Pool;
let app: FastifyInstance;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  app = await buildApp({ config, pool });
  // Test-only routes to exercise the error handler (registered before the app is ready).
  app.get('/_t/boom', async () => {
    throw new Error('secret internal detail');
  });
  app.get('/_t/conflict', async () => {
    throw new AppError(409, 'SOME_CONFLICT', 'Nope', [{ sku: 'X' }]);
  });
  app.get(
    '/_t/validated',
    {
      schema: {
        querystring: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } } },
      },
    },
    async () => ({ ok: true }),
  );
  app.post('/_t/echo', async (req) => req.body);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

describe('health', () => {
  it('live returns 200', async () => {
    const res = await app.inject({ url: '/health/live' });
    expect(res.statusCode).toBe(200);
  });

  it('ready returns 200 when the database is reachable', async () => {
    const res = await app.inject({ url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
  });

  it('ready returns 503 when the database is down', async () => {
    const deadPool = new pg.Pool({
      connectionString: 'postgres://u:p@127.0.0.1:1/none',
      connectionTimeoutMillis: 500,
    });
    deadPool.on('error', () => undefined);
    const deadApp = await buildApp({ config, pool: deadPool });
    const res = await deadApp.inject({ url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('NOT_READY');
    await deadApp.close();
    await deadPool.end();
  });
});

describe('error envelope', () => {
  it('404 uses the envelope', async () => {
    const res = await app.inject({ url: '/nope' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('AppError keeps its status, code and details', async () => {
    const res = await app.inject({ url: '/_t/conflict' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: 'SOME_CONFLICT', details: [{ sku: 'X' }] });
  });

  it('validation failures return 400 VALIDATION_ERROR', async () => {
    const res = await app.inject({ url: '/_t/validated?n=abc' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('unknown errors return 500 without leaking internals', async () => {
    const res = await app.inject({ url: '/_t/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('secret internal detail');
    expect(res.body).not.toContain('stack');
  });

  it('rejects oversized bodies with 413', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/_t/echo',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ blob: 'a'.repeat(200 * 1024) }),
    });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('request id', () => {
  it('generates one when none is sent', async () => {
    const res = await app.inject({ url: '/health/live' });
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });

  it('echoes a safe client-supplied id', async () => {
    const res = await app.inject({ url: '/health/live', headers: { 'x-request-id': 'abc-123' } });
    expect(res.headers['x-request-id']).toBe('abc-123');
  });

  it('replaces an unsafe client-supplied id', async () => {
    const res = await app.inject({
      url: '/health/live',
      headers: { 'x-request-id': 'bad id with spaces & symbols' },
    });
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });
});
