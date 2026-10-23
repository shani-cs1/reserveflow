# Architecture Decision Record 0001: Inventory Concurrency Strategy

## Status
Accepted

## Context
In a shared inventory distribution system, multiple users or API clients can concurrently place orders for the same fast-moving products. Without strict concurrency controls, a classic "check-then-act" race condition occurs:
1. Request A checks available stock for SKU-001 (5 units available, requests 4).
2. Request B simultaneously checks available stock for SKU-001 (5 units available, requests 3).
3. Both evaluate `available >= requested` as true.
4. Both write reservation mutations, resulting in 7 reserved units against 5 on-hand units—overselling by 2 units and violating core inventory invariants (`on_hand >= reserved`).

Furthermore, multi-line orders can attempt to reserve multiple products simultaneously. If Order 1 locks Product A then Product B, while Order 2 concurrently locks Product B then Product A, a deadlock will occur at the database engine level.

## Decision
We enforce concurrency correctness through a three-layer strategy:

### 1. Deterministic Lock Ordering
When reserving order lines, we aggregate requested quantities per product and sort the target product IDs deterministically (lexicographically by UUID ascending):
```typescript
const sortedProductIds = Array.from(requestedPerProduct.keys()).sort();
```
All concurrent transactions acquire row locks in the exact same sequence, mathematically preventing circular-wait deadlock conditions.

### 2. Pessimistic Row Locking (`SELECT ... FOR UPDATE`)
Inside an atomic PostgreSQL transaction, product rows are selected using `SELECT ... FOR UPDATE`:
- In PostgreSQL (and PGlite WASM), this instructs the storage engine to place exclusive row-level write locks on the matching rows.
- Any competing reservation request attempting to access any of those products is queued at the row lock until the active transaction completes (commits or rolls back).
- Within the lock, fresh `on_hand_quantity` and `reserved_quantity` are verified against the invariant:
  `on_hand_quantity - reserved_quantity >= requested`

### 3. All-or-Nothing Atomic Enforcement
If even a single line item lacks sufficient stock:
- The entire transaction throws an `InsufficientStockError`.
- PostgreSQL rolls back all partial row modifications immediately.
- Zero units are reserved for any line item.
- The competing request receives a controlled `409 Conflict` response with error code `INSUFFICIENT_STOCK` and exact SKU-level breakdown.

### 4. Database-Level Invariant Check Constraints
As defense-in-depth, database schema check constraints guarantee physical integrity at the storage layer:
- `CONSTRAINT chk_on_hand_non_negative CHECK (on_hand_quantity >= 0)`
- `CONSTRAINT chk_reserved_non_negative CHECK (reserved_quantity >= 0)`
- `CONSTRAINT chk_on_hand_ge_reserved CHECK (on_hand_quantity >= reserved_quantity)`

## Consequences
- **Positive**: Guaranteed zero overselling, zero negative quantities, deterministic deadlock prevention, and immediate rollback on insufficient stock.
- **Trade-off**: Row locking serializes competing requests for the same exact SKUs during the transaction window (~5-15ms). For high-throughput scenarios across distinct SKUs, parallel execution proceeds unimpeded because locking is strictly row-scoped rather than table-scoped.
