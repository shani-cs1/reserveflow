import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import type pg from 'pg';

// db/migrations at the repo root (works from both src/ and dist/).
const defaultDir = fileURLToPath(new URL('../../../../db/migrations', import.meta.url));

/**
 * Applies db/migrations/*.sql in filename order. Each file runs in its own transaction and is
 * recorded in schema_migrations, so running this again is safe. An advisory lock stops two
 * processes from migrating at the same time.
 */
export async function runMigrations(pool: pg.Pool, dir: string = defaultDir): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const done = new Set(
      (await client.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
        (r) => r.filename,
      ),
    );
    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      }
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
}

// Run directly: `npm run migrate`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import('../env.js');
  const { createPool } = await import('./client.js');
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const pool = createPool(url);
  try {
    const applied = await runMigrations(pool);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
