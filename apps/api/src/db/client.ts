import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export function createPool(databaseUrl: string): pg.Pool {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 2_000, // fail fast if the DB is unreachable (readiness check)
  });
  // An idle client can error (e.g. DB restart). Without this listener Node would crash.
  pool.on('error', (err) => console.error('idle database client error:', err.message));
  return pool;
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
