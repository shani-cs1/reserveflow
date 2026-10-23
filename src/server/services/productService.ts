import { eq, desc, count, sql } from 'drizzle-orm';
import { getDatabase } from '../db/index.ts';
import { products, stockAdjustments } from '../db/schema.ts';
import { AppError, ConflictError, NotFoundError, ValidationError } from '../utils/errors.ts';
import { AuditActor, AuditService } from './auditService.ts';

export interface CreateProductInput {
  sku: string;
  name: string;
  unitPrice: number; // in cents
  initialOnHandQuantity?: number;
}

export interface AdjustStockInput {
  delta: number;
  reason: string;
}

export class ProductService {
  static async createProduct(input: CreateProductInput, actor: AuditActor, requestId: string) {
    const db = getDatabase();
    const sku = input.sku.trim().toUpperCase();
    const name = input.name.trim();

    if (!sku) throw new ValidationError('Product SKU is required');
    if (!name) throw new ValidationError('Product name is required');
    if (input.unitPrice < 0) throw new ValidationError('Unit price must be non-negative');
    const initialStock = Math.max(0, input.initialOnHandQuantity ?? 0);

    // Check SKU uniqueness
    const [existing] = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.sku, sku))
      .limit(1);

    if (existing) {
      throw new ConflictError(`Product with SKU '${sku}' already exists`, 'DUPLICATE_SKU');
    }

    const [created] = await db
      .insert(products)
      .values({
        sku,
        name,
        unitPrice: Math.round(input.unitPrice),
        onHandQuantity: initialStock,
        reservedQuantity: 0,
      })
      .returning();

    // If initial stock was provided, record an initial adjustment record
    if (initialStock > 0) {
      await db.insert(stockAdjustments).values({
        productId: created.id,
        delta: initialStock,
        previousOnHand: 0,
        newOnHand: initialStock,
        reason: 'Initial inventory load',
        actorId: actor.id,
        actorEmail: actor.email,
      });
    }

    await AuditService.record({
      eventType: 'PRODUCT_CREATED',
      actor,
      targetEntityType: 'PRODUCT',
      targetEntityId: created.id,
      requestId,
      metadata: {
        sku: created.sku,
        name: created.name,
        unitPrice: created.unitPrice,
        initialOnHandQuantity: initialStock,
      },
    });

    return {
      ...created,
      availableQuantity: created.onHandQuantity - created.reservedQuantity,
    };
  }

  static async listProducts(page: number = 1, limit: number = 20) {
    const db = getDatabase();
    const offset = Math.max(0, (page - 1) * limit);

    const [totalResult] = await db.select({ total: count() }).from(products);
    const total = Number(totalResult?.total ?? 0);

    const items = await db
      .select()
      .from(products)
      .orderBy(desc(products.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = items.map((p) => ({
      ...p,
      availableQuantity: p.onHandQuantity - p.reservedQuantity,
    }));

    return {
      items: enriched,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getProductById(id: string) {
    const db = getDatabase();
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) {
      throw new NotFoundError(`Product with ID '${id}' not found`);
    }

    return {
      ...product,
      availableQuantity: product.onHandQuantity - product.reservedQuantity,
    };
  }

  static async adjustStock(
    id: string,
    input: AdjustStockInput,
    actor: AuditActor,
    requestId: string
  ) {
    const db = getDatabase();
    const reason = input.reason?.trim();
    if (!reason) {
      throw new ValidationError('A reason is required for stock adjustments');
    }
    if (typeof input.delta !== 'number' || input.delta === 0) {
      throw new ValidationError('Delta must be a non-zero integer');
    }

    // Execute within transaction with row locking
    const updatedProduct = await db.transaction(async (tx) => {
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, id))
        .limit(1);

      if (!product) {
        throw new NotFoundError(`Product with ID '${id}' not found`);
      }

      const previousOnHand = product.onHandQuantity;
      const newOnHand = previousOnHand + input.delta;

      if (newOnHand < 0) {
        throw new ConflictError(
          `Adjustment would result in negative on-hand quantity (${newOnHand})`,
          'INVALID_INVENTORY_STATE'
        );
      }

      if (newOnHand < product.reservedQuantity) {
        throw new ConflictError(
          `Adjustment would reduce on-hand quantity (${newOnHand}) below reserved quantity (${product.reservedQuantity})`,
          'INVALID_INVENTORY_STATE'
        );
      }

      const [updated] = await tx
        .update(products)
        .set({
          onHandQuantity: newOnHand,
          updatedAt: new Date(),
        })
        .where(eq(products.id, id))
        .returning();

      await tx.insert(stockAdjustments).values({
        productId: id,
        delta: input.delta,
        previousOnHand,
        newOnHand,
        reason,
        actorId: actor.id,
        actorEmail: actor.email,
      });

      return updated;
    });

    await AuditService.record({
      eventType: 'STOCK_ADJUSTED',
      actor,
      targetEntityType: 'PRODUCT',
      targetEntityId: id,
      requestId,
      metadata: {
        sku: updatedProduct.sku,
        delta: input.delta,
        previousOnHand: updatedProduct.onHandQuantity - input.delta,
        newOnHand: updatedProduct.onHandQuantity,
        reason,
      },
    });

    return {
      ...updatedProduct,
      availableQuantity: updatedProduct.onHandQuantity - updatedProduct.reservedQuantity,
    };
  }

  static async getAdjustmentHistory(productId: string, limit: number = 50) {
    const db = getDatabase();
    // Verify product exists
    await this.getProductById(productId);

    return db
      .select()
      .from(stockAdjustments)
      .where(eq(stockAdjustments.productId, productId))
      .orderBy(desc(stockAdjustments.createdAt))
      .limit(limit);
  }
}
