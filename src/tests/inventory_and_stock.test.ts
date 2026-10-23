import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../server/db/index.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { ProductService } from '../server/services/productService.ts';
import { ConflictError, ValidationError } from '../server/utils/errors.ts';
import { getTestActors } from './testHelpers.ts';

describe('Inventory & Stock Management', () => {
  let adminActor: { id: string; email: string; role: 'ADMIN' | 'OPERATOR' };

  beforeAll(async () => {
    await initDatabase();
    await seedDatabase();
    const actors = await getTestActors();
    adminActor = actors.adminActor;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('creates a new product with initial on-hand stock and verifies invariants', async () => {
    const sku = `TEST-${Date.now()}`;
    const product = await ProductService.createProduct(
      {
        sku,
        name: 'Industrial Pressure Gauge',
        unitPrice: 12500,
        initialOnHandQuantity: 50,
      },
      adminActor,
      'req_test_create'
    );

    expect(product.sku).toBe(sku);
    expect(product.onHandQuantity).toBe(50);
    expect(product.reservedQuantity).toBe(0);
    expect(product.availableQuantity).toBe(50);
  });

  it('rejects duplicate SKU creation with 409 conflict', async () => {
    const sku = `DUP-${Date.now()}`;
    await ProductService.createProduct(
      { sku, name: 'First Product', unitPrice: 1000 },
      adminActor,
      'req_dup_1'
    );

    await expect(
      ProductService.createProduct(
        { sku, name: 'Duplicate Product', unitPrice: 2000 },
        adminActor,
        'req_dup_2'
      )
    ).rejects.toThrow(ConflictError);
  });

  it('successfully adjusts stock with a valid required reason', async () => {
    const sku = `ADJ-${Date.now()}`;
    const product = await ProductService.createProduct(
      { sku, name: 'Stock Adjustment Test Product', unitPrice: 500, initialOnHandQuantity: 20 },
      adminActor,
      'req_adj_init'
    );

    const adjusted = await ProductService.adjustStock(
      product.id,
      { delta: 15, reason: 'Restock shipment received from supplier' },
      adminActor,
      'req_adj_1'
    );

    expect(adjusted.onHandQuantity).toBe(35);
    expect(adjusted.availableQuantity).toBe(35);

    // Verify stock adjustment history contains this entry
    const history = await ProductService.getAdjustmentHistory(product.id);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].reason).toBe('Restock shipment received from supplier');
    expect(history[0].delta).toBe(15);
  });

  it('rejects stock adjustment when reason is missing', async () => {
    const sku = `NO-REASON-${Date.now()}`;
    const product = await ProductService.createProduct(
      { sku, name: 'Missing Reason Test', unitPrice: 100, initialOnHandQuantity: 10 },
      adminActor,
      'req_no_reason'
    );

    await expect(
      ProductService.adjustStock(
        product.id,
        { delta: 5, reason: '' },
        adminActor,
        'req_no_reason_fail'
      )
    ).rejects.toThrow(ValidationError);
  });

  it('prevents stock adjustment that would result in negative inventory', async () => {
    const sku = `NEG-${Date.now()}`;
    const product = await ProductService.createProduct(
      { sku, name: 'Negative Test', unitPrice: 100, initialOnHandQuantity: 10 },
      adminActor,
      'req_neg'
    );

    await expect(
      ProductService.adjustStock(
        product.id,
        { delta: -25, reason: 'Accidental excessive reduction' },
        adminActor,
        'req_neg_fail'
      )
    ).rejects.toThrow(ConflictError);
  });
});
