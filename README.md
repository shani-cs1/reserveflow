# ReserveFlow — Production Inventory Reservation System

**Candidate:** Zeeshan Haider  
**Role:** Junior Full-Stack / Backend Engineer  
**System:** ReserveFlow v1.0.0  

ReserveFlow is a high-reliability inventory reservation and order orchestration engine built with Node.js, TypeScript, PostgreSQL (Drizzle ORM), and React. It guarantees strict consistency, zero overselling, all-or-nothing multi-line reservations, persistent idempotency, and an append-only audit trail.

---

## 1. Architecture Overview

ReserveFlow adopts a clean layered architecture with PostgreSQL as the immutable single source of truth for all business state.

```
+-------------------------------------------------------------------------------+
|                            OPERATIONS WEB CLIENT                              |
|                   (React 19, Tailwind CSS, Vite Dashboard)                    |
+---------------------------------------+---------------------------------------+
                                        | REST / JSON (JWT Bearer Auth)
                                        v
+-------------------------------------------------------------------------------+
|                           RESERVEFLOW HTTP API                                |
|  - Correlation ID / Request Logger (Pino structured JSON, sensitive redacted) |
|  - Role Guard (ADMIN vs OPERATOR enforcement)                                 |
|  - Idempotency Middleware (PostgreSQL-backed key acquisition & replay)        |
|  - Transactional Inventory Engine (Row-level locking, deadlock prevention)    |
|  - Prometheus Metrics (/metrics) & OpenAPI 3.0 Interactive Docs (/docs)       |
+---------------------------------------+---------------------------------------+
                                        | PostgreSQL Transactions (Drizzle ORM)
                                        v
+-------------------------------------------------------------------------------+
|                       POSTGRESQL RELATIONAL ENGINE                            |
|  - products (CHECK: on_hand_quantity >= reserved_quantity >= 0)               |
|  - orders (PENDING -> RESERVED -> CONFIRMED | CANCELLED)                      |
|  - order_lines (Snapshot pricing at time of order creation)                   |
|  - stock_adjustments (Mandatory adjustment reason audit)                      |
|  - idempotency_keys (Durable request hash, response caching & lock)           |
|  - audit_events (Append-only event log with actor & correlation metadata)     |
+-------------------------------------------------------------------------------+
```

### Reservation Sequence Flow
1. Client issues `POST /api/v1/orders/:id/reserve` with an optional or generated `Idempotency-Key` header.
2. The server acquires an `IN_PROGRESS` idempotency record or replays a cached result.
3. In a PostgreSQL transaction, all target products are sorted by UUID and locked with `SELECT ... FOR UPDATE`.
4. If **any** line lacks sufficient available stock (`on_hand - reserved < requested`), the transaction rolls back completely (**All-or-Nothing**), records a `RESERVATION_FAILED` audit event, and returns HTTP 409 `INSUFFICIENT_STOCK`.
5. If all lines have stock, `reserved_quantity` is incremented for all products, order status transitions to `RESERVED`, audit event `RESERVATION_SUCCEEDED` is recorded, and the transaction commits.

---

## 2. Local Development Demo Accounts

Demo accounts are **development/test only**. They are never seeded automatically in production.

Automatic local seeding must be opted into explicitly with `DEMO_SEED=true` (and is rejected when `NODE_ENV=production`). Alternatively, run `npm run db:seed` manually in a non-production environment.

| Role | Email | Password | Permissions |
|---|---|---|---|
| **ADMIN** | `admin@reserveflow.local` | `AdminPass123!` | Create products, adjust inventory with reason, view all orders and audit trail |
| **OPERATOR** | `operator@reserveflow.local` | `OperatorPass123!` | Create multi-line orders, reserve stock, confirm, and cancel |

*(Passwords are hashed with bcrypt; plaintext credentials are never stored or logged. The production login UI does not expose or quick-fill demo credentials.)*

---

## 3. Environment Variables

| Variable | Description | Default / Example | Required |
|---|---|---|---|
| `NODE_ENV` | Runtime environment mode | `development` / `production` | Yes |
| `PORT` | HTTP port for server and UI | `3000` | Yes |
| `DATABASE_URL` | PostgreSQL connection string used by the application | `postgres://user:pass@localhost:5432/db` | Optional (falls back to embedded PostgreSQL PGlite WASM) |
| `TEST_DATABASE_URL` | Explicitly isolated database for DB-backed tests | `postgres://user:pass@localhost:5432/reserveflow_test` | Optional (tests use in-memory PGlite when absent) |
| `POSTGRES_DB` | PostgreSQL database name (Docker) | `reserveflow_db` | Yes |
| `POSTGRES_USER` | PostgreSQL user (Docker) | `reserveflow` | Yes |
| `POSTGRES_PASSWORD`| PostgreSQL password (Docker) | `reserveflow_secret_pass` | Yes |
| `JWT_SECRET` | Secret key for signing JWT tokens | random 32+ character value | Yes in production; startup fails on missing/known-default secrets |
| `DEMO_SEED` | Opt-in local demo seeding (`true`/`false`) | `false` | No; rejected in production |
| `CORS_ORIGIN` | Allowed CORS origins for API | `*` | No |
| `LOG_LEVEL` | Pino log level (`info`, `debug`, `error`)| `info` | No |
| `METRICS_TOKEN` | Token protecting `/metrics`; when unset, authenticated ADMIN JWT is required | *(empty)* | No |

Tests never fall through to `DATABASE_URL`. DB-backed tests use `TEST_DATABASE_URL` when configured, otherwise the isolated in-memory PGlite engine. Tests refuse to run if `TEST_DATABASE_URL` targets the same database as `DATABASE_URL`.

---

## 4. Setup and Run Instructions

### Option A: Using Docker Compose (Recommended)
```bash
# 1. Clone or extract the project
# 2. Copy the environment configuration
cp .env.example .env

# 3. Set a strong JWT_SECRET in .env (32+ random characters). Production startup
#    fails if it is missing, empty, or a known default.
#    Example: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 4. Start PostgreSQL and the ReserveFlow Application
docker compose up --build
```
Access the application at `http://localhost:3000`.

---

### Option B: Local Node.js Development
**Prerequisites:** Node.js 20+ and npm.

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env

# 3. Run database migrations (or let the app auto-migrate on start)
npm run db:migrate

# 4. Seed default admin, operator, and sample inventory (development only)
npm run db:seed

# 5. Start development server
npm run dev
```

To let the server seed demo data automatically in development, set `DEMO_SEED=true` before starting. Production startup never seeds demo accounts or data.

---

### Option C: Windows PowerShell Instructions
```powershell
# 1. Extract ZIP archive
Expand-Archive -Path ReserveFlow-Complete.zip -DestinationPath .\ReserveFlow

# 2. Navigate to project root
cd .\ReserveFlow\reserveflow

# 3. Copy environment configuration
Copy-Item .env.example .env

# 4. Install dependencies
npm install

# 5. Start development server
npm run dev
```
Open your browser at `http://localhost:3000`.

---

## 5. Available Scripts & Verification

| Command | Action |
|---|---|
| `npm run test` | Run Vitest unit & integration test suite (auth, inventory, concurrency, idempotency) |
| `npm run lint` | Run TypeScript type checks (`tsc --noEmit`) |
| `npm run build` | Build production frontend bundle |
| `npm run db:migrate` | Apply versioned Drizzle migrations |
| `npm run db:seed` | Seed default accounts and initial demo products |
| `npm run package:zip` | Generate standalone `ReserveFlow-Complete.zip` package (manual packaging only; no runtime download endpoint) |

DB-backed tests run only against `TEST_DATABASE_URL` or isolated in-memory PGlite, never against the live `DATABASE_URL`.

---

## 6. Endpoints & Interactive Documentation

- **Interactive OpenAPI 3.0 Documentation:** `http://localhost:3000/docs` (public)
- **OpenAPI JSON Spec:** `http://localhost:3000/docs/openapi.json` (public)
- **Service Readiness Probe:** `http://localhost:3000/health/ready` (public, no raw internal errors)
- **Liveness Probe:** `http://localhost:3000/health/live` (public)
- **Prometheus Metrics:** `http://localhost:3000/metrics` (requires `METRICS_TOKEN`, otherwise ADMIN JWT)

System Tools (OpenAPI Docs, Health, Metrics, Audit Trail) are available from the ADMIN-only menu in the navbar. There is no runtime source-archive download endpoint; use `npm run package:zip` when a deliverable archive is required.

### Key API Routes
- `POST /api/v1/auth/login` — Public login
- `GET /api/v1/auth/me` — Current authenticated user
- `GET /api/v1/products` — List products (with available quantity)
- `POST /api/v1/products` — Create product (ADMIN only)
- `POST /api/v1/products/:id/adjustments` — Adjust on-hand stock with reason (ADMIN only)
- `GET /api/v1/products/:id/adjustments` — Stock adjustment history (ADMIN or OPERATOR)
- `POST /api/v1/orders` — Create pending order with snapshot pricing
- `GET /api/v1/orders` — List orders
- `GET /api/v1/orders/:id` — Retrieve order with line items & audit history
- `POST /api/v1/orders/:id/reserve` — Atomically reserve stock (Idempotency-Key)
- `POST /api/v1/orders/:id/confirm` — Confirm order / finalize sale (Idempotency-Key)
- `POST /api/v1/orders/:id/cancel` — Cancel order & release stock (Idempotency-Key)
- `GET /api/v1/audit-events` — Recent audit events (ADMIN only)

---

## 7. Key Engineering Decisions

### 1. Concurrency & Row Locking Strategy
- Competing reservation requests for the same limited stock are serialized inside a PostgreSQL transaction using `SELECT ... FOR UPDATE`.
- To completely avoid multi-row deadlocks across complex multi-line orders, product IDs are always sorted deterministically before acquiring row locks.
- Database schema check constraints (`on_hand_quantity >= reserved_quantity`) provide defense-in-depth protection against data corruption.
- *Detailed in `docs/decisions/0001-inventory-concurrency-strategy.md`*.

### 2. Persistent Idempotency
- Stored durably in PostgreSQL table `idempotency_keys`.
- Retried identical requests replay original cached status and payload.
- Mismatched payloads using the same key trigger HTTP 409 `IDEMPOTENCY_CONFLICT`.
- In-flight parallel duplicates trigger HTTP 409 `CONCURRENT_IDEMPOTENT_REQUEST`.
- *Detailed in `docs/decisions/0002-idempotency-storage-and-replay.md`*.

### 3. Append-Only Audit Trail
- Stored in `audit_events` with actor ID, email, role, target entity, request correlation ID (`X-Request-Id`), and non-secret metadata.
- Captures `PRODUCT_CREATED`, `STOCK_ADJUSTED`, `ORDER_CREATED`, `RESERVATION_SUCCEEDED`, `RESERVATION_FAILED`, `ORDER_CONFIRMED`, and `ORDER_CANCELLED`.

### 4. Consistent Error Envelope
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "One or more items cannot be reserved",
    "details": [{ "sku": "PUMP-001", "available": 2, "requested": 5 }],
    "requestId": "req_01a2b3c4d5"
  }
}
```

---

## 8. Assumptions, Known Limitations & Next Improvements

### Current Assumptions
- Single warehouse location with minor currency unit precision (cents).
- Stock adjustments require an explicit human or operational reason.

### Known Limitations
- Idempotency records expire after 24 hours (cleanup routine runs via TTL query).
- Offset pagination is used for products (`page` & `limit`), suitable for up to 100k items.

### Recommended Next Improvements
1. **Cursor-based Pagination**: For large-scale multi-million SKU catalogs.
2. **Transactional Outbox Pattern**: Emit domain events (`ORDER_CONFIRMED`) to Apache Kafka / RabbitMQ.
3. **Distributed Rate Limiting**: Valkey/Redis token bucket per client IP/user ID.
4. **OpenTelemetry Distributed Tracing**: Export spans to Jaeger/Tempo.

---

## 9. Production Operations Plan

- **TLS / Ingress**: Terminate TLS at ingress / Cloud Load Balancer with HTTP/2 and automated Let's Encrypt certificates.
- **Secrets Management**: Inject secrets from HashiCorp Vault or AWS Secrets Manager into container environment variables.
- **Backups**: Continuous PostgreSQL WAL archiving with point-in-time recovery (PITR) to S3/GCS.
- **Zero-Downtime Migrations**: Use expand/contract schema pattern. Run `drizzle-kit migrate` as pre-deployment Kubernetes initContainers.
- **Horizontal Scaling**: Stateless API container instances scaled horizontally behind load balancer; PostgreSQL connection pooling managed via PgBouncer.
- **Rollback Strategy**: Container version rollbacks via Kubernetes deployment revisions or blue/green traffic shifting.
