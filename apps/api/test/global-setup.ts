import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { testDatabaseUrl } from './helpers.js';

// Runs once before all tests: bring the real test database up to the latest migration.
export default async function setup() {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl() });
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}
