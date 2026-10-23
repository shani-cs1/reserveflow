import { getDatabase } from '../db/index.ts';
import { auditEvents } from '../db/schema.ts';
import { desc, eq } from 'drizzle-orm';
import { logger } from '../utils/logger.ts';

export interface AuditActor {
  id: string;
  email: string;
  role: string;
}

export interface RecordAuditParams {
  eventType: string;
  actor: AuditActor;
  targetEntityType: 'PRODUCT' | 'ORDER' | 'STOCK' | 'SYSTEM';
  targetEntityId: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

export class AuditService {
  static async record(params: RecordAuditParams) {
    try {
      const db = getDatabase();
      await db.insert(auditEvents).values({
        eventType: params.eventType,
        actorId: params.actor.id,
        actorEmail: params.actor.email,
        actorRole: params.actor.role,
        targetEntityType: params.targetEntityType,
        targetEntityId: params.targetEntityId,
        requestId: params.requestId,
        metadata: params.metadata || {},
      });
    } catch (err) {
      logger.error({ err, params, msg: 'Failed to record audit event' });
      // In production audit persistence is critical, but we log instead of crashing non-transactional callers
    }
  }

  static async getForEntity(targetEntityId: string, limit: number = 50) {
    const db = getDatabase();
    return db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.targetEntityId, targetEntityId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }

  static async listRecent(limit: number = 100) {
    const db = getDatabase();
    return db
      .select()
      .from(auditEvents)
      .orderBy(desc(auditEvents.createdAt))
      .limit(limit);
  }
}
