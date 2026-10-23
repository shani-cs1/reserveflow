# ReserveFlow Architecture Overview

ReserveFlow is a production-oriented inventory reservation and order management engine designed for distributed wholesale operations where shared warehouse stock must never be oversold.

---

## 1. Component Architecture Diagram

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT TIER                                       |
|  - Operations Dashboard (React 19 + Tailwind CSS)                                 |
|  - Automated API Consumers / Warehouse Clients (Idempotency-Key Header Support)    |
+------------------------------------------+----------------------------------------+
                                           | HTTP / REST (JWT Bearer Auth)
                                           v
+-----------------------------------------------------------------------------------+
|                            RESERVEFLOW API SERVICE                                |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | Request Logger     |   | Auth & RBAC Guard     |   | Global Error Envelope  |  |
|  | - X-Request-Id     |   | - ADMIN / OPERATOR    |   | - Sanitized stack trace|  |
|  | - Pino Structured  |   | - bcrypt / JWT        |   | - Stable error codes   |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | Product & Stock    |   | Atomic Reservation    |   | Idempotency Engine     |  |
|  | - Invariant Engine |   | - Multi-line order    |   | - SHA-256 payload hash |  |
|  | - Required reasons |   | - SELECT FOR UPDATE   |   | - Cached replay        |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | Prometheus Metrics |   | Append-Only Audit     |   | OpenAPI 3.0 Docs       |  |
|  | - Route durations  |   | - Durable events      |   | - Swagger UI /docs     |  |
|  | - Outcomes counter |   | - Correlation IDs     |   | - /docs/openapi.json   |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
+------------------------------------------+----------------------------------------+
                                           | PostgreSQL Transaction (Drizzle ORM)
                                           v
+-----------------------------------------------------------------------------------+
|                            POSTGRESQL PERSISTENCE LAYER                           |
|                                                                                   |
|  +------------------+  +------------------+  +-------------------+  +-----------+ |
|  | products         |  | orders           |  | idempotency_keys  |  | audit     | |
|  | - CHECK (on_hand |  | - PENDING        |  | - request_hash    |  | events    | |
|  |   >= reserved)   |  | - RESERVED       |  | - response_body   |  | - append  | |
|  | - unit_price     |  | - CONFIRMED      |  | - expires_at      |  |   only    | |
|  +------------------+  | - CANCELLED      |  +-------------------+  +-----------+ |
|                        +------------------+                                       |
+-----------------------------------------------------------------------------------+
```

---

## 2. Order State Transition Diagram

```
       +---------------------------------------------+
       |                                             |
       v                                             |
  [ PENDING ] ------------------------> [ CANCELLED ]|
       |                                      ^      |
       | reserveOrder()                       |      |
       | (atomic all-or-nothing check)        |      |
       v                                      |      |
  [ RESERVED ] -------------------------------+      |
       |                 cancelOrder()               |
       |                 (releases reserved stock)   |
       |                                             |
       | confirmOrder()                              |
       | (permanently deducts on-hand & reserved)    |
       v                                             |
  [ CONFIRMED ]                                      |
```

*All other transitions (e.g., CONFIRMED -> CANCELLED, CANCELLED -> RESERVED) are rejected by the engine with HTTP 409 `INVALID_STATE_TRANSITION` without modifying any data.*

---

## 3. Atomic Reservation Sequence Diagram

```
Client / UI                     API Server                       PostgreSQL Engine
    |                               |                                    |
    | POST /api/v1/orders/:id/reserve                                    |
    | Header: Idempotency-Key       |                                    |
    |------------------------------>|                                    |
    |                               | 1. Check & acquire idempotency key |
    |                               |----------------------------------->|
    |                               |<-----------------------------------|
    |                               |                                    |
    |                               | 2. BEGIN TRANSACTION               |
    |                               |----------------------------------->|
    |                               |                                    |
    |                               | 3. SELECT * FROM orders            |
    |                               |    WHERE id = :id FOR UPDATE       |
    |                               |----------------------------------->|
    |                               |<-----------------------------------|
    |                               | (Verify status === 'PENDING')      |
    |                               |                                    |
    |                               | 4. Sort product IDs ascending      |
    |                               |    SELECT * FROM products          |
    |                               |    WHERE id IN (...) FOR UPDATE    |
    |                               |----------------------------------->|
    |                               |<-----------------------------------|
    |                               |                                    |
    |                               | 5. Verify Invariants for all lines:|
    |                               |    (on_hand - reserved >= req)     |
    |                               |                                    |
    |                   [If any line lacks sufficient stock]             |
    |                               |                                    |
    |                               | 6a. ROLLBACK TRANSACTION           |
    |                               |----------------------------------->|
    |                               | 7a. Insert 'RESERVATION_FAILED'    |
    |                               |     audit event                    |
    |                               |----------------------------------->|
    | 409 Conflict                  |                                    |
    | (INSUFFICIENT_STOCK detail)   |                                    |
    |<------------------------------|                                    |
    |                               |                                    |
    |                   [If all lines have sufficient stock]             |
    |                               |                                    |
    |                               | 6b. UPDATE products                |
    |                               |     SET reserved = reserved + req  |
    |                               |     UPDATE orders                  |
    |                               |     SET status = 'RESERVED'        |
    |                               |----------------------------------->|
    |                               | 7b. COMMIT TRANSACTION             |
    |                               |----------------------------------->|
    |                               | 8b. Complete idempotency record    |
    |                               |     Insert 'RESERVATION_SUCCEEDED' |
    | 200 OK                        |     audit event                    |
    | (Order details)               |                                    |
    |<------------------------------|                                    |
```
