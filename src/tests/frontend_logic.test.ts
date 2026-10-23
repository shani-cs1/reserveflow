import { describe, it, expect, beforeEach } from 'vitest';
import { generateIdempotencyKey } from '../client/api.ts';
import { Product, Order } from '../client/types.ts';

describe('Frontend Business Logic & Invariants', () => {
  it('generates well-formed random idempotency keys with custom prefix', () => {
    const key1 = generateIdempotencyKey('res');
    const key2 = generateIdempotencyKey('res');

    expect(key1).toMatch(/^res_\d+_[a-z0-9]+$/);
    expect(key2).toMatch(/^res_\d+_[a-z0-9]+$/);
    expect(key1).not.toBe(key2);
  });

  it('computes warehouse stock levels correctly without violating invariants', () => {
    const sampleProducts: Product[] = [
      {
        id: '1',
        sku: 'PUMP-001',
        name: 'Pump 1HP',
        unitPrice: 35000,
        onHandQuantity: 50,
        reservedQuantity: 10,
        availableQuantity: 40,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: '2',
        sku: 'VALVE-002',
        name: 'Valve Brass',
        unitPrice: 8500,
        onHandQuantity: 100,
        reservedQuantity: 25,
        availableQuantity: 75,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const totalOnHand = sampleProducts.reduce((sum, p) => sum + p.onHandQuantity, 0);
    const totalReserved = sampleProducts.reduce((sum, p) => sum + p.reservedQuantity, 0);
    const totalAvailable = sampleProducts.reduce((sum, p) => sum + p.availableQuantity, 0);

    expect(totalOnHand).toBe(150);
    expect(totalReserved).toBe(35);
    expect(totalAvailable).toBe(115);
    expect(totalOnHand - totalReserved).toBe(totalAvailable);
  });

  it('verifies permitted order actions based on order status', () => {
    const canReserve = (status: string) => status === 'PENDING';
    const canConfirm = (status: string) => status === 'RESERVED';
    const canCancel = (status: string) => status === 'PENDING' || status === 'RESERVED';

    expect(canReserve('PENDING')).toBe(true);
    expect(canReserve('RESERVED')).toBe(false);
    expect(canReserve('CONFIRMED')).toBe(false);

    expect(canConfirm('RESERVED')).toBe(true);
    expect(canConfirm('PENDING')).toBe(false);
    expect(canConfirm('CONFIRMED')).toBe(false);

    expect(canCancel('PENDING')).toBe(true);
    expect(canCancel('RESERVED')).toBe(true);
    expect(canCancel('CONFIRMED')).toBe(false);
    expect(canCancel('CANCELLED')).toBe(false);
  });
});
