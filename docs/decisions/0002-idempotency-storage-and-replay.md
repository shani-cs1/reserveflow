# Architecture Decision Record 0002: Idempotency Storage and Replay Behavior

## Status
Accepted

## Context
Network timeouts, client retry loops, and transient connection drops can cause mutation requests (`/reserve`, `/confirm`, `/cancel`) to be re-transmitted. Without idempotency controls:
- A retried reservation could double-reserve inventory.
- A retried confirmation could double-deduct warehouse stock.
- A retried cancellation could cause illegal state errors or release already-cleared inventory.

Furthermore, clients might inadvertently or maliciously reuse an existing `Idempotency-Key` header with completely different request parameters, which must be rejected to prevent state corruption.

## Decision
We implement persistent, database-backed idempotency using PostgreSQL table `idempotency_keys`:

### 1. Storage Schema
- `key` (VARCHAR PK): Client-supplied idempotency key from `Idempotency-Key` header.
- `user_id` (UUID): Authenticated user who initiated the request.
- `request_path` (VARCHAR): Endpoint URL.
- `request_method` (VARCHAR): HTTP verb (e.g., `POST`).
- `request_hash` (VARCHAR 64): SHA-256 hash computed over `path + method + JSON.stringify(body)`.
- `status` (VARCHAR): `IN_PROGRESS` | `COMPLETED` | `FAILED`.
- `status_code` (INTEGER): HTTP status code of the logical outcome.
- `response_body` (JSONB): Exact cached response payload returned to client.
- `expires_at` (TIMESTAMP): Sliding expiration window (24 hours).

### 2. State Machine & Transition Rules
1. **Initial Acquisition**: When an `Idempotency-Key` arrives:
   - If key does not exist: An `IN_PROGRESS` row is inserted. Processing proceeds.
2. **Identical Replay**: If key exists and `status === 'COMPLETED'`:
   - If incoming request hash matches `request_hash`: The handler short-circuits execution and immediately returns the cached `status_code` and `response_body` without executing database mutations.
3. **Material Difference Conflict**: If key exists and incoming request hash differs:
   - The handler immediately throws `409 Conflict` with error code `IDEMPOTENCY_CONFLICT` ("Idempotency key has already been used for a materially different request").
4. **Concurrent In-Flight Duplicate**: If key exists and `status === 'IN_PROGRESS'`:
   - The handler returns `409 Conflict` with error code `CONCURRENT_IDEMPOTENT_REQUEST` to prevent race conditions while the first worker is still writing.
5. **Completion**: Upon successful mutation execution, status transitions to `COMPLETED` with serialized response JSON. If execution fails, status records `FAILED` with error details.

## Consequences
- **Positive**: Mutation endpoints survive arbitrary network retries safely; clients never double-reserve or double-charge; state is durable in PostgreSQL and survives server restarts.
- **Trade-off**: Requires an additional PostgreSQL read and write per mutating request. This overhead (~1-2ms) is negligible compared to the critical safety guarantees it provides.
