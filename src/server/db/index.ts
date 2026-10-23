import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePgLite } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import * as schema from './schema.ts';
import { logger } from '../utils/logger.ts';
import { config } from '../config.ts';

const { Pool } = pg;

export type AppDatabase = ReturnType<typeof drizzleNodePg<typeof schema>> | ReturnType<typeof drizzlePgLite<typeof schema>>;

let dbInstance: AppDatabase | null = null;
let rawPgPool: pg.Pool | null = null;
let rawPgLite: PGlite | null = null;

export const SQL_MIGRATION_DDL = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Products table with inventory invariants
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit_price INTEGER NOT NULL,
  on_hand_quantity INTEGER NOT NULL DEFAULT 0,
  reserved_quantity INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_on_hand_non_negative CHECK (on_hand_quantity >= 0),
  CONSTRAINT chk_reserved_non_negative CHECK (reserved_quantity >= 0),
  CONSTRAINT chk_on_hand_ge_reserved CHECK (on_hand_quantity >= reserved_quantity)
);

-- Stock adjustments table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  previous_on_hand INTEGER NOT NULL,
  new_on_hand INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id),
  actor_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number VARCHAR(64) UNIQUE NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  total_amount INTEGER NOT NULL DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  creator_email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Order lines table
CREATE TABLE IF NOT EXISTS order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  sku VARCHAR(64) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  unit_price_snapshot INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT chk_order_line_quantity_positive CHECK (quantity > 0)
);

-- Idempotency keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key VARCHAR(255) PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  request_path VARCHAR(255) NOT NULL,
  request_method VARCHAR(16) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Append-only audit events table
CREATE TABLE IF NOT EXISTS audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(64) NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  actor_email VARCHAR(255) NOT NULL,
  actor_role VARCHAR(32) NOT NULL,
  target_entity_type VARCHAR(64) NOT NULL,
  target_entity_id VARCHAR(255) NOT NULL,
  request_id VARCHAR(255) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Indexes for high-performance querying
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
`;

function normalizeDatabaseTarget(databaseUrl: string): string {
  try {
    const parsed = new URL(databaseUrl);
    return `${parsed.hostname}:${parsed.port}${parsed.pathname}`;
  } catch {
    return databaseUrl;
  }
}

export async function initDatabase(): Promise<AppDatabase> {
  if (dbInstance) return dbInstance;

  const isTestEnvironment = config.NODE_ENV === 'test' || process.env.VITEST === 'true';

  // In tests, never fall through to the live DATABASE_URL. Use an explicitly
  // isolated TEST_DATABASE_URL or the safe in-memory PGlite fallback below.
  if (isTestEnvironment && config.TEST_DATABASE_URL && config.DATABASE_URL) {
    if (
      normalizeDatabaseTarget(config.TEST_DATABASE_URL) ===
      normalizeDatabaseTarget(config.DATABASE_URL)
    ) {
      throw new Error(
        'Refusing to run tests: TEST_DATABASE_URL must not target the same database as DATABASE_URL. Configure an isolated test database.'
      );
    }
  }

  const databaseUrl = isTestEnvironment ? config.TEST_DATABASE_URL : config.DATABASE_URL;

  if (!isTestEnvironment && !databaseUrl) {
    logger.warn({ msg: 'DATABASE_URL is not configured; using embedded PGlite storage' });
  }

  if (isTestEnvironment && !databaseUrl) {
    logger.info({ msg: 'No TEST_DATABASE_URL configured; using isolated in-memory PGlite for tests' });
  }

  if (databaseUrl && (databaseUrl.startsWith('postgres://') || databaseUrl.startsWith('postgresql://'))) {
    logger.info({ msg: 'Connecting to PostgreSQL via node-postgres pool', url: databaseUrl.replace(/:[^:@]*@/, ':****@') });
    try {
      rawPgPool = new Pool({
        connectionString: databaseUrl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      // Test connection
      const client = await rawPgPool.connect();
      try {
        await client.query(SQL_MIGRATION_DDL);
        logger.info({ msg: 'PostgreSQL migrations applied successfully' });
      } finally {
        client.release();
      }

      dbInstance = drizzleNodePg(rawPgPool, { schema });
      return dbInstance;
    } catch (err) {
      logger.error({ err, msg: 'Failed to connect to external PostgreSQL, falling back to embedded PostgreSQL (PGlite)' });
    }
  }

  // Embedded PostgreSQL (PGlite) fallback - 100% genuine PostgreSQL 16 WASM
  logger.info({ msg: 'Initializing embedded PostgreSQL engine (PGlite WASM)' });
  rawPgLite = new PGlite();
  await rawPgLite.waitReady;
  await rawPgLite.exec(SQL_MIGRATION_DDL);
  logger.info({ msg: 'Embedded PostgreSQL engine initialized with schema DDL' });

  dbInstance = drizzlePgLite(rawPgLite, { schema });
  return dbInstance;
}

export function getDatabase(): AppDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized! Call initDatabase() first.');
  }
  return dbInstance;
}

export async function closeDatabase(): Promise<void> {
  if (rawPgPool) {
    await rawPgPool.end();
    rawPgPool = null;
  }
  if (rawPgLite) {
    await rawPgLite.close();
    rawPgLite = null;
  }
  dbInstance = null;
}
