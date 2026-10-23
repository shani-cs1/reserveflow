import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../server/db/index.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { ProductService } from '../server/services/productService.ts';
import { OrderService } from '../server/services/orderService.ts';
import { InsufficientStockError } from '../server/utils/errors.ts';
import { getTestActors } from './testHelpers.ts';

describe('Concurrency & Race Condition Control', () => {
  let operatorActor: { id: string; email: string; role: 'ADMIN' | 'OPERATOR' };
  let adminActor: { id: string; email: string; role: 'ADMIN' | 'OPERATOR' };

  beforeAll(async () => {
    await initDatabase();
    await seedDatabase();
    const actors = await getTestActors();
    operatorActor = actors.operatorActor;
    adminActor = actors.adminActor;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('proves that two concurrent competing reservations cannot oversell limited stock', async () => {
    // 1. Setup product with limited stock: exactly 5 units available
    const sku = `CONCUR-${Date.now()}`;
    const product = await ProductService.createProduct(
      {
        sku,
        name: 'High Demand Hydraulic Pump',
        unitPrice: 50000,
        initialOnHandQuantity: 5,
      },
      adminActor,
      'req_concur_setup'
    );

    // 2. Create Order 1 requesting 4 units
    const order1 = await OrderService.createOrder(
      {
        customerName: 'Buyer Alpha Corp',
        lines: [{ productId: product.id, quantity: 4 }],
      },
      operatorActor,
      'req_concur_ord1'
    );

    // 3. Create Order 2 requesting 3 units (4 + 3 = 7, but only 5 available!)
    const order2 = await OrderService.createOrder(
      {
        customerName: 'Buyer Beta Ltd',
        lines: [{ productId: product.id, quantity: 3 }],
      },
      operatorActor,
      'req_concur_ord2'
    );

    // 4. Fire both reservation requests concurrently using Promise.allSettled
    const [result1, result2] = await Promise.allSettled([
      OrderService.reserveOrder(order1.id, operatorActor, 'req_concur_res1'),
      OrderService.reserveOrder(order2.id, operatorActor, 'req_concur_res2'),
    ]);

    // 5. Evaluate outcomes: EXACTLY ONE must succeed, and EXACTLY ONE must fail with InsufficientStockError
    const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
    const failures = [result1, result2].filter((r) => r.status === 'rejected');

    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // Verify the failure was a controlled InsufficientStockError
    const rejectedReason = (failures[0] as PromiseRejectedResult).reason;
    expect(rejectedReason).toBeInstanceOf(InsufficientStockError);
    expect(rejectedReason.code).toBe('INSUFFICIENT_STOCK');

    // 6. Verify database state integrity
    const updatedProd = await ProductService.getProductById(product.id);

    // Invariant checks:
    expect(updatedProd.onHandQuantity).toBe(5);
    // Reserved quantity should be either 4 (if order 1 won) or 3 (if order 2 won)
    expect([3, 4]).toContain(updatedProd.reservedQuantity);
    // Invariant: on_hand >= reserved >= 0
    expect(updatedProd.onHandQuantity).toBeGreaterThanOrEqual(updatedProd.reservedQuantity);
    expect(updatedProd.reservedQuantity).toBeGreaterThanOrEqual(0);
    expect(updatedProd.availableQuantity).toBe(updatedProd.onHandQuantity - updatedProd.reservedQuantity);
    expect(updatedProd.availableQuantity).toBeGreaterThanOrEqual(0);
  });
});
