import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../db/index.ts';
import { idempotencyKeys } from '../db/schema.ts';
import { ConflictError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';

export interface IdempotencyCheckResult {
  isCached: boolean;
  statusCode?: number;
  responseBody?: unknown;
}

export class IdempotencyService {
  static computeRequestHash(path: string, method: string, body: unknown): string {
    const serialized = JSON.stringify({
      path,
      method: method.toUpperCase(),
      body: body || {},
    });
    return crypto.createHash('sha256').update(serialized).digest('hex');
  }

  /**
   * Checks or registers an idempotency key.
   * If existing record is COMPLETED and hash matches -> returns cached result.
   * If existing record has a DIFFERENT hash -> throws ConflictError (key reuse with different payload).
   * If existing record is IN_PROGRESS -> throws ConflictError (concurrent duplicate request).
   */
  static async checkAndAcquire(
    key: string,
    userId: string,
    path: string,
    method: string,
    body: unknown
  ): Promise<IdempotencyCheckResult> {
    const db = getDatabase();
    const requestHash = this.computeRequestHash(path, method, body);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24-hour expiration

    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);

    if (existing) {
      // Check expiration
      if (new Date(existing.expiresAt) < now) {
        // Expired key can be overwritten
        await db
          .update(idempotencyKeys)
          .set({
            userId,
            requestPath: path,
            requestMethod: method,
            requestHash,
            status: 'IN_PROGRESS',
            statusCode: null,
            responseBody: null,
            createdAt: now,
            expiresAt,
          })
          .where(eq(idempotencyKeys.key, key));

        return { isCached: false };
      }

      // Check if the request is materially different
      if (existing.requestHash !== requestHash) {
        throw new ConflictError(
          'Idempotency key has already been used for a materially different request',
          'IDEMPOTENCY_CONFLICT',
          { key, path }
        );
      }

      // If still in progress, return conflict to prevent parallel race conditions
      if (existing.status === 'IN_PROGRESS') {
        throw new ConflictError(
          'A request with this idempotency key is already in progress. Please retry shortly.',
          'CONCURRENT_IDEMPOTENT_REQUEST',
          { key }
        );
      }

      // Return cached response
      logger.info({ key, path, msg: 'Returning cached response for idempotent request' });
      return {
        isCached: true,
        statusCode: existing.statusCode || 200,
        responseBody: existing.responseBody,
      };
    }

    // Acquire lock by inserting IN_PROGRESS record
    try {
      await db.insert(idempotencyKeys).values({
        key,
        userId,
        requestPath: path,
        requestMethod: method,
        requestHash,
        status: 'IN_PROGRESS',
        createdAt: now,
        expiresAt,
      });
    } catch (insertErr: any) {
      // If another process inserted between our select and insert
      logger.warn({ key, insertErr, msg: 'Race condition on idempotency key insertion' });
      throw new ConflictError(
        'Concurrent request detected with this idempotency key',
        'CONCURRENT_IDEMPOTENT_REQUEST',
        { key }
      );
    }

    return { isCached: false };
  }

  static async complete(key: string, statusCode: number, responseBody: unknown) {
    const db = getDatabase();
    await db
      .update(idempotencyKeys)
      .set({
        status: 'COMPLETED',
        statusCode,
        responseBody: responseBody as any,
      })
      .where(eq(idempotencyKeys.key, key));
  }

  static async fail(key: string, statusCode: number = 500, errorBody?: unknown) {
    const db = getDatabase();
    await db
      .update(idempotencyKeys)
      .set({
        status: 'FAILED',
        statusCode,
        responseBody: errorBody as any,
      })
      .where(eq(idempotencyKeys.key, key));
  }
}
