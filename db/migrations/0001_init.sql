-- ReserveFlow initial schema. PostgreSQL 13+ (gen_random_uuid is built in).

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sku               text NOT NULL,
  name              text NOT NULL CHECK (length(btrim(name)) > 0),
  unit_price_minor  bigint NOT NULL CHECK (unit_price_minor >= 0),
  on_hand_quantity  integer NOT NULL DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_uq UNIQUE (sku),
  -- Core invariant: on_hand >= reserved >= 0
  CONSTRAINT products_reserved_nonneg CHECK (reserved_quantity >= 0),
  CONSTRAINT products_on_hand_ge_reserved CHECK (on_hand_quantity >= reserved_quantity)
);
CREATE INDEX products_created_idx ON products (created_at, id);

CREATE TABLE stock_adjustments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid NOT NULL REFERENCES products(id),
  delta          integer NOT NULL CHECK (delta <> 0),
  reason         text NOT NULL CHECK (length(btrim(reason)) > 0),
  on_hand_before integer NOT NULL,
  on_hand_after  integer NOT NULL CHECK (on_hand_after >= 0),
  actor_id       uuid NOT NULL REFERENCES users(id),
  request_id     text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_adjustments_product_idx ON stock_adjustments (product_id, created_at DESC);

CREATE TABLE orders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status     text NOT NULL DEFAULT 'PENDING'
             CHECK (status IN ('PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_created_by_idx ON orders (created_by, created_at DESC);

CREATE TABLE order_lines (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       uuid NOT NULL REFERENCES products(id),
  -- Snapshots: later product changes never alter existing orders
  sku_snapshot     text    NOT NULL,
  name_snapshot    text    NOT NULL,
  unit_price_minor bigint  NOT NULL CHECK (unit_price_minor >= 0),
  quantity         integer NOT NULL CHECK (quantity > 0),
  CONSTRAINT order_lines_order_product_uq UNIQUE (order_id, product_id)
);
CREATE INDEX order_lines_product_idx ON order_lines (product_id);

CREATE TABLE idempotency_keys (
  actor_id      uuid NOT NULL REFERENCES users(id),
  key           text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  -- Fingerprint of method + route + body; detects key reuse with a different request
  request_hash  text NOT NULL,
  status_code   integer,   -- NULL while the first request is still in flight
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, key)
);

CREATE TABLE audit_events (
  id          bigserial PRIMARY KEY,
  event_type  text NOT NULL,
  actor_id    uuid REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id   uuid NOT NULL,
  request_id  text NOT NULL,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events (entity_type, entity_id, id);

-- Append-only: block UPDATE and DELETE at the database level.
CREATE FUNCTION audit_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
