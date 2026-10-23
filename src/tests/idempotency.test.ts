import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initDatabase, closeDatabase } from '../server/db/index.ts';
import { seedDatabase } from '../server/db/seed.ts';
import { IdempotencyService } from '../server/services/idempotencyService.ts';
import { ConflictError } from '../server/utils/errors.ts';
import { getTestActors } from './testHelpers.ts';

describe('Idempotency Persistence & Replay', () => {
  let userId: string;

  beforeAll(async () => {
    await initDatabase();
    await seedDatabase();
    const actors = await getTestActors();
    userId = actors.operatorActor.id;
  });

  afterAll(async () => {
    await closeDatabase();
  });

  it('records an idempotency key, caches response, and replays cached result on retry', async () => {
    const key = `idem-key-${Date.now()}`;
    const path = '/api/v1/orders/test-id/reserve';
    const method = 'POST';
    const body = { note: 'First reservation attempt' };

    // 1. Initial check & acquire
    const check1 = await IdempotencyService.checkAndAcquire(key, userId, path, method, body);
    expect(check1.isCached).toBe(false);

    // Complete with mock response
    const mockResponse = { status: 'RESERVED', orderId: 'test-id', totalAmount: 45000 };
    await IdempotencyService.complete(key, 200, mockResponse);

    // 2. Retry identical request with same key
    const check2 = await IdempotencyService.checkAndAcquire(key, userId, path, method, body);
    expect(check2.isCached).toBe(true);
    expect(check2.statusCode).toBe(200);
    expect(check2.responseBody).toEqual(mockResponse);
  });

  it('rejects key reuse when request payload is materially different with 409 conflict', async () => {
    const key = `idem-conflict-${Date.now()}`;
    const path = '/api/v1/orders/test-id/reserve';
    const method = 'POST';
    const body1 = { note: 'Original payload' };
    const body2 = { note: 'Tampered different payload' };

    // Initial acquisition
    await IdempotencyService.checkAndAcquire(key, userId, path, method, body1);
    await IdempotencyService.complete(key, 200, { success: true });

    // Attempting same key with different body must throw ConflictError
    await expect(
      IdempotencyService.checkAndAcquire(key, userId, path, method, body2)
    ).rejects.toThrow(ConflictError);
  });
});
