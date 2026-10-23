import { pgTable, uuid, varchar, text, integer, timestamp, jsonb, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// Users table (ADMIN and OPERATOR roles)
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 32 }).notNull().$type<'ADMIN' | 'OPERATOR'>(),
  name: varchar('name', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Products table with strict inventory invariants
export const products = pgTable('products', {
  id: uuid('id').defaultRandom().primaryKey(),
  sku: varchar('sku', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  unitPrice: integer('unit_price').notNull(), // in minor units (e.g. cents)
  onHandQuantity: integer('on_hand_quantity').notNull().default(0),
  reservedQuantity: integer('reserved_quantity').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('chk_on_hand_non_negative', sql`${table.onHandQuantity} >= 0`),
  check('chk_reserved_non_negative', sql`${table.reservedQuantity} >= 0`),
  check('chk_on_hand_ge_reserved', sql`${table.onHandQuantity} >= ${table.reservedQuantity}`),
]);

// Stock adjustment history with required reason
export const stockAdjustments = pgTable('stock_adjustments', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id').references(() => products.id, { onDelete: 'cascade' }).notNull(),
  delta: integer('delta').notNull(), // positive for additions, negative for reductions
  previousOnHand: integer('previous_on_hand').notNull(),
  newOnHand: integer('new_on_hand').notNull(),
  reason: text('reason').notNull(),
  actorId: uuid('actor_id').references(() => users.id).notNull(),
  actorEmail: varchar('actor_email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// Orders table
export type OrderStatus = 'PENDING' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED';

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderNumber: varchar('order_number', { length: 64 }).notNull().unique(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 32 }).notNull().default('PENDING').$type<OrderStatus>(),
  totalAmount: integer('total_amount').notNull().default(0), // in minor units
  createdBy: uuid('created_by').references(() => users.id).notNull(),
  creatorEmail: varchar('creator_email', { length: 255 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// Order line items with price snapshot
export const orderLines = pgTable('order_lines', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }).notNull(),
  productId: uuid('product_id').references(() => products.id).notNull(),
  sku: varchar('sku', { length: 64 }).notNull(),
  productName: varchar('product_name', { length: 255 }).notNull(),
  unitPriceSnapshot: integer('unit_price_snapshot').notNull(), // price snapshot at creation time
  quantity: integer('quantity').notNull(),
  lineTotal: integer('line_total').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check('chk_order_line_quantity_positive', sql`${table.quantity} > 0`),
]);

// Persistent Idempotency records
export type IdempotencyStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export const idempotencyKeys = pgTable('idempotency_keys', {
  key: varchar('key', { length: 255 }).primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  requestPath: varchar('request_path', { length: 255 }).notNull(),
  requestMethod: varchar('request_method', { length: 16 }).notNull(),
  requestHash: varchar('request_hash', { length: 64 }).notNull(), // SHA-256 of path + method + body
  status: varchar('status', { length: 32 }).notNull().$type<IdempotencyStatus>(),
  statusCode: integer('status_code'),
  responseBody: jsonb('response_body'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// Append-only Audit Trail
export const auditEvents = pgTable('audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  actorId: varchar('actor_id', { length: 255 }).notNull(),
  actorEmail: varchar('actor_email', { length: 255 }).notNull(),
  actorRole: varchar('actor_role', { length: 32 }).notNull(),
  targetEntityType: varchar('target_entity_type', { length: 64 }).notNull(), // 'PRODUCT' | 'ORDER' | 'STOCK'
  targetEntityId: varchar('target_entity_id', { length: 255 }).notNull(),
  requestId: varchar('request_id', { length: 255 }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
