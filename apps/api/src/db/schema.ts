// Drizzle table definitions. They MIRROR db/migrations/*.sql (the SQL files are the source
// of truth; nothing here creates or alters tables at runtime).
import {
  bigint,
  bigserial,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['ADMIN', 'OPERATOR'] }).notNull(),
  createdAt: createdAt(),
});

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sku: text('sku').notNull().unique(),
  name: text('name').notNull(),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
  onHandQuantity: integer('on_hand_quantity').notNull().default(0),
  reservedQuantity: integer('reserved_quantity').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const stockAdjustments = pgTable('stock_adjustments', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  delta: integer('delta').notNull(),
  reason: text('reason').notNull(),
  onHandBefore: integer('on_hand_before').notNull(),
  onHandAfter: integer('on_hand_after').notNull(),
  actorId: uuid('actor_id')
    .notNull()
    .references(() => users.id),
  requestId: text('request_id').notNull(),
  createdAt: createdAt(),
});

export const orders = pgTable('orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: text('status', { enum: ['PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED'] })
    .notNull()
    .default('PENDING'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orderLines = pgTable('order_lines', {
  id: uuid('id').primaryKey().defaultRandom(),
  orderId: uuid('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  skuSnapshot: text('sku_snapshot').notNull(),
  nameSnapshot: text('name_snapshot').notNull(),
  unitPriceMinor: bigint('unit_price_minor', { mode: 'number' }).notNull(),
  quantity: integer('quantity').notNull(),
});

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    statusCode: integer('status_code'),
    responseBody: jsonb('response_body'),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.actorId, t.key] })],
);

export const auditEvents = pgTable('audit_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventType: text('event_type').notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  requestId: text('request_id').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: createdAt(),
});
