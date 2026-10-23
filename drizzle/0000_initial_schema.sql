-- ReserveFlow Initial Schema Migration
-- Migration: 0000_initial_schema.sql

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Products with strict check constraints
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

-- Stock adjustments with required audit reason
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

-- Orders
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

-- Order lines with price snapshot
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

-- Idempotency keys with expiration
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

-- Append-only audit events
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

-- Optimized indexes
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_order_lines_order_id ON order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_product_id ON stock_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_target ON audit_events(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);
