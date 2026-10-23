# AI Assistance Disclosure & Verification Record

## 1. Tools Used
- Google AI Studio Assistant (Gemini 3.8 Flash model)
- TypeScript / Vitest test runner for continuous verification

## 2. Tasks for Which Tools Were Used
- Drafting initial Drizzle ORM PostgreSQL schema definitions.
- Structuring OpenAPI 3.0.3 specification paths, parameters, and response envelopes.
- Synthesizing integration test scenarios for concurrency race conditions and idempotency key persistence.
- Generating Tailwind CSS markup for the React operations dashboard components.

## 3. Example Where Generated Output Was Corrected or Rejected
### Issue: Extension Dependency (`pgcrypto`) vs Core PostgreSQL Functions
- **Initial Generated Code**: The initial database migration DDL generated:
  ```sql
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
  ```
- **Why It Failed**: In embedded PostgreSQL testing environments (PGlite WASM) and non-superuser cloud-hosted PostgreSQL instances, creating extensions requires superuser privileges or fails because `pgcrypto` is an optional contrib C library. This caused all initial integration tests to fail immediately with:
  `error: extension "pgcrypto" is not available`
- **Correction Made**: The code was corrected to leverage core PostgreSQL 13+ built-in `gen_random_uuid()` directly, eliminating the unnecessary external extension dependency while ensuring 100% standard compatibility across all PostgreSQL versions (v13 through v17).

### Issue: Test Actor Referential Integrity
- **Initial Generated Code**: The test cases initially used dummy hardcoded UUIDs (`00000000-0000-0000-0000-000000000001`) for test actors.
- **Why It Failed**: Real PostgreSQL enforced foreign key constraints (`stock_adjustments_actor_id_fkey` and `orders_created_by_fkey`).
- **Correction Made**: Created `testHelpers.ts` to dynamically resolve real seeded accounts (`admin@reserveflow.local`, `operator@reserveflow.local`), strictly preserving database referential integrity.

## 4. Security, Correctness, and Licensing Checks
- **Security Check**:
  - Validated that passwords are never stored in plaintext (using pure JavaScript `bcryptjs` with 10 salt rounds).
  - Validated that sensitive fields (`password`, `authorization`, `token`, `secret`) are systematically redacted from Pino structured logs.
  - Validated that stack traces are never leaked in API response envelopes.
  - Implemented request body size limits (`1mb`) to prevent memory exhaustion attacks.
- **Correctness Check**:
  - Automated integration tests verify that concurrent conflicting reservations never result in negative or oversold quantities.
  - Schema check constraints guarantee physical integrity at the PostgreSQL engine level (`chk_on_hand_ge_reserved`).
- **Licensing & Dependencies**:
  - All third-party packages are licensed under permissive open-source licenses (MIT or Apache-2.0).
