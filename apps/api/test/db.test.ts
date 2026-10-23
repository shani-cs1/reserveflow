import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';
import { testDatabaseUrl } from './helpers.js';

let pool: pg.Pool;
beforeAll(() => {
  pool = new pg.Pool({ connectionString: testDatabaseUrl() });
});
afterAll(async () => {
  await pool.end();
});

// Runs `sql` inside a transaction that is always rolled back, so tests leave no data behind.
async function expectDbError(sql: string, params: unknown[], pattern: RegExp) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await expect(client.query(sql, params)).rejects.toThrow(pattern);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

describe('migrations', () => {
  it('are idempotent: a second run applies nothing', async () => {
    expect(await runMigrations(pool)).toEqual([]);
  });
});

describe('schema invariants', () => {
  const insertProduct = `INSERT INTO products (sku, name, unit_price_minor, on_hand_quantity, reserved_quantity)
                         VALUES ($1, 'T', 100, $2, $3)`;

  it('rejects reserved_quantity greater than on_hand_quantity', async () => {
    await expectDbError(insertProduct, ['T-1', 5, 6], /products_on_hand_ge_reserved/);
  });

  it('rejects negative reserved_quantity', async () => {
    await expectDbError(insertProduct, ['T-2', 5, -1], /products_reserved_nonneg/);
  });

  it('rejects a negative price', async () => {
    await expectDbError(
      `INSERT INTO products (sku, name, unit_price_minor) VALUES ('T-3', 'T', -5)`,
      [],
      /unit_price_minor/,
    );
  });

  it('audit_events is append-only', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO audit_events (event_type, entity_type, entity_id, request_id)
         VALUES ('T', 'product', gen_random_uuid(), 'r1')`,
      );
      await expect(client.query(`UPDATE audit_events SET event_type = 'X'`)).rejects.toThrow(
        /append-only/,
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
