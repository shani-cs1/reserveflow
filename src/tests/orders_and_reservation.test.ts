import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../server/db/index.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { ProductService } from '../server/services/productService.ts';
import { OrderService } from '../server/services/orderService.ts';
import { InsufficientStockError, InvalidStateTransitionError } from '../server/utils/errors.ts';
import { getTestActors } from './testHelpers.ts';

describe('Orders & Atomic Reservations', () => {
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

  it('creates an order and snapshots product prices at creation time', async () => {
    const sku = `PRICE-SNAP-${Date.now()}`;
    const product = await ProductService.createProduct(
      { sku, name: 'Snapshot Item', unitPrice: 5000, initialOnHandQuantity: 100 },
      adminActor,
      'req_snap_init'
    );

    const order = await OrderService.createOrder(
      {
        customerName: 'Test Snapshot Corp',
        lines: [{ productId: product.id, quantity: 2 }],
      },
      operatorActor,
      'req_snap_order'
    );

    expect(order.status).toBe('PENDING');
    expect(order.lines[0].unitPriceSnapshot).toBe(5000);
    expect(order.totalAmount).toBe(10000);
  });

  it('atomically rolls back all lines when one line lacks stock (All-or-Nothing)', async () => {
    // Create product A with plenty of stock (50 units)
    const prodA = await ProductService.createProduct(
      { sku: `ROLLBACK-A-${Date.now()}`, name: 'Item A', unitPrice: 1000, initialOnHandQuantity: 50 },
      adminActor,
      'req_rb_a'
    );

    // Create product B with limited stock (2 units)
    const prodB = await ProductService.createProduct(
      { sku: `ROLLBACK-B-${Date.now()}`, name: 'Item B', unitPrice: 2000, initialOnHandQuantity: 2 },
      adminActor,
      'req_rb_b'
    );

    // Create order requesting 10 of A and 5 of B (B only has 2!)
    const order = await OrderService.createOrder(
      {
        customerName: 'Rollback Test Client',
        lines: [
          { productId: prodA.id, quantity: 10 },
          { productId: prodB.id, quantity: 5 },
        ],
      },
      operatorActor,
      'req_rb_order'
    );

    // Attempting to reserve must throw InsufficientStockError
    await expect(
      OrderService.reserveOrder(order.id, operatorActor, 'req_rb_reserve')
    ).rejects.toThrow(InsufficientStockError);

    // CRITICAL PROOF: Verify Product A was NOT reserved at all! (0 reserved)
    const checkedProdA = await ProductService.getProductById(prodA.id);
    expect(checkedProdA.reservedQuantity).toBe(0);
    expect(checkedProdA.availableQuantity).toBe(50);

    const checkedProdB = await ProductService.getProductById(prodB.id);
    expect(checkedProdB.reservedQuantity).toBe(0);

    // Verify order remains PENDING
    const checkedOrder = await OrderService.getOrderById(order.id);
    expect(checkedOrder.status).toBe('PENDING');
  });

  it('successfully completes happy path: PENDING -> RESERVED -> CONFIRMED', async () => {
    const prod = await ProductService.createProduct(
      { sku: `HAPPY-${Date.now()}`, name: 'Happy Path Item', unitPrice: 3000, initialOnHandQuantity: 20 },
      adminActor,
      'req_happy_init'
    );

    const order = await OrderService.createOrder(
      {
        customerName: 'Acme Heavy Industries',
        lines: [{ productId: prod.id, quantity: 5 }],
      },
      operatorActor,
      'req_happy_order'
    );

    // 1. Reserve
    const reservedOrder = await OrderService.reserveOrder(order.id, operatorActor, 'req_happy_reserve');
    expect(reservedOrder.status).toBe('RESERVED');

    const prodAfterReserve = await ProductService.getProductById(prod.id);
    expect(prodAfterReserve.onHandQuantity).toBe(20);
    expect(prodAfterReserve.reservedQuantity).toBe(5);
    expect(prodAfterReserve.availableQuantity).toBe(15);

    // 2. Confirm
    const confirmedOrder = await OrderService.confirmOrder(order.id, operatorActor, 'req_happy_confirm');
    expect(confirmedOrder.status).toBe('CONFIRMED');

    const prodAfterConfirm = await ProductService.getProductById(prod.id);
    // Sale completed: stock leaves on-hand and reserved
    expect(prodAfterConfirm.onHandQuantity).toBe(15);
    expect(prodAfterConfirm.reservedQuantity).toBe(0);
    expect(prodAfterConfirm.availableQuantity).toBe(15);
  });

  it('releases reserved stock when a RESERVED order is cancelled', async () => {
    const prod = await ProductService.createProduct(
      { sku: `CANCEL-${Date.now()}`, name: 'Cancel Release Item', unitPrice: 4000, initialOnHandQuantity: 30 },
      adminActor,
      'req_cancel_init'
    );

    const order = await OrderService.createOrder(
      {
        customerName: 'Cancelled Order Customer',
        lines: [{ productId: prod.id, quantity: 12 }],
      },
      operatorActor,
      'req_cancel_order'
    );

    // Reserve 12 units
    await OrderService.reserveOrder(order.id, operatorActor, 'req_cancel_res');
    const reservedProd = await ProductService.getProductById(prod.id);
    expect(reservedProd.reservedQuantity).toBe(12);
    expect(reservedProd.availableQuantity).toBe(18);

    // Cancel order
    const cancelledOrder = await OrderService.cancelOrder(order.id, operatorActor, 'req_cancel_act');
    expect(cancelledOrder.status).toBe('CANCELLED');

    // Verify reserved stock was released back
    const releasedProd = await ProductService.getProductById(prod.id);
    expect(releasedProd.reservedQuantity).toBe(0);
    expect(releasedProd.availableQuantity).toBe(30);
  });

  it('rejects invalid state transitions without modifying data', async () => {
    const prod = await ProductService.createProduct(
      { sku: `TRANS-${Date.now()}`, name: 'Transition Item', unitPrice: 1000, initialOnHandQuantity: 10 },
      adminActor,
      'req_trans_init'
    );

    const order = await OrderService.createOrder(
      { customerName: 'Transition Customer', lines: [{ productId: prod.id, quantity: 1 }] },
      operatorActor,
      'req_trans_order'
    );

    // Cancel order from PENDING
    await OrderService.cancelOrder(order.id, operatorActor, 'req_trans_cancel');

    // Attempting to reserve a CANCELLED order must be rejected
    await expect(
      OrderService.reserveOrder(order.id, operatorActor, 'req_invalid_reserve')
    ).rejects.toThrow(InvalidStateTransitionError);

    // Attempting to confirm a CANCELLED order must be rejected
    await expect(
      OrderService.confirmOrder(order.id, operatorActor, 'req_invalid_confirm')
    ).rejects.toThrow(InvalidStateTransitionError);
  });
});
