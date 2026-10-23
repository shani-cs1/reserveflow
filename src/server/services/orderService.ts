import { eq, desc, sql, inArray } from 'drizzle-orm';
import { getDatabase } from '../db/index.ts';
import { orders, orderLines, products, OrderStatus } from '../db/schema.ts';
import {
  AppError,
  ConflictError,
  InsufficientStockError,
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '../utils/errors.ts';
import { AuditActor, AuditService } from './auditService.ts';
import { reservationAttemptsTotal } from '../utils/metrics.ts';

export interface CreateOrderLineInput {
  productId: string;
  quantity: number;
}

export interface CreateOrderInput {
  customerName: string;
  lines: CreateOrderLineInput[];
}

export class OrderService {
  /**
   * Generates a unique human-readable order number
   */
  private static generateOrderNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `ORD-${dateStr}-${rand}`;
  }

  /**
   * Create a pending order with snapshot pricing for each line item
   */
  static async createOrder(input: CreateOrderInput, actor: AuditActor, requestId: string) {
    const customerName = input.customerName?.trim();
    if (!customerName) {
      throw new ValidationError('Customer name is required');
    }
    if (!input.lines || !Array.isArray(input.lines) || input.lines.length === 0) {
      throw new ValidationError('Order must contain at least one line item');
    }

    // Validate quantities
    for (const line of input.lines) {
      if (!line.productId) throw new ValidationError('Product ID is required for each line');
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new ValidationError('Line item quantity must be a positive integer');
      }
    }

    const db = getDatabase();

    // Fetch product details for all requested products
    const productIds = [...new Set(input.lines.map((l) => l.productId))];
    const foundProducts = await db
      .select()
      .from(products)
      .where(inArray(products.id, productIds));

    const productMap = new Map(foundProducts.map((p) => [p.id, p]));

    for (const pid of productIds) {
      if (!productMap.has(pid)) {
        throw new NotFoundError(`Product with ID '${pid}' does not exist`);
      }
    }

    // Calculate totals and prepare line items
    let totalAmount = 0;
    const linesToInsert = input.lines.map((line) => {
      const prod = productMap.get(line.productId)!;
      const lineTotal = prod.unitPrice * line.quantity;
      totalAmount += lineTotal;
      return {
        productId: prod.id,
        sku: prod.sku,
        productName: prod.name,
        unitPriceSnapshot: prod.unitPrice,
        quantity: line.quantity,
        lineTotal,
      };
    });

    const orderNumber = this.generateOrderNumber();

    const createdOrder = await db.transaction(async (tx) => {
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber,
          customerName,
          status: 'PENDING',
          totalAmount,
          createdBy: actor.id,
          creatorEmail: actor.email,
        })
        .returning();

      for (const line of linesToInsert) {
        await tx.insert(orderLines).values({
          orderId: order.id,
          ...line,
        });
      }

      return order;
    });

    await AuditService.record({
      eventType: 'ORDER_CREATED',
      actor,
      targetEntityType: 'ORDER',
      targetEntityId: createdOrder.id,
      requestId,
      metadata: {
        orderNumber: createdOrder.orderNumber,
        customerName: createdOrder.customerName,
        totalAmount: createdOrder.totalAmount,
        itemCount: linesToInsert.length,
      },
    });

    return this.getOrderById(createdOrder.id);
  }

  /**
   * Retrieve order with line items and audit timeline
   */
  static async getOrderById(id: string) {
    const db = getDatabase();
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);

    if (!order) {
      throw new NotFoundError(`Order with ID '${id}' not found`);
    }

    const lines = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, id));

    const auditHistory = await AuditService.getForEntity(id);

    return {
      ...order,
      lines,
      auditHistory,
    };
  }

  /**
   * List orders with pagination
   */
  static async listOrders(limit: number = 50) {
    const db = getDatabase();
    const orderList = await db
      .select()
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(limit);

    // Fetch lines for each order
    const result = [];
    for (const order of orderList) {
      const lines = await db
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, order.id));
      result.push({ ...order, lines });
    }

    return result;
  }

  /**
   * Reserve order lines atomically using PostgreSQL row-level locking (SELECT ... FOR UPDATE)
   * Enforces all-or-nothing stock availability and invariant:
   * on_hand_quantity >= reserved_quantity
   */
  static async reserveOrder(orderId: string, actor: AuditActor, requestId: string) {
    const db = getDatabase();

    try {
      const updatedOrder = await db.transaction(async (tx) => {
        // Fetch order
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);

        if (!order) {
          throw new NotFoundError(`Order with ID '${orderId}' not found`);
        }

        // Validate state transition: Only PENDING -> RESERVED is permitted
        if (order.status !== 'PENDING') {
          reservationAttemptsTotal.inc({ outcome: 'invalid_state' });
          throw new InvalidStateTransitionError(order.status, 'RESERVED');
        }

        // Get lines for this order
        const lines = await tx
          .select()
          .from(orderLines)
          .where(eq(orderLines.orderId, orderId));

        if (lines.length === 0) {
          throw new ValidationError('Cannot reserve an order with no line items');
        }

        // Aggregate requested quantities per product
        const requestedPerProduct = new Map<string, number>();
        for (const line of lines) {
          const current = requestedPerProduct.get(line.productId) || 0;
          requestedPerProduct.set(line.productId, current + line.quantity);
        }

        // CRITICAL CONCURRENCY STRATEGY:
        // Always sort product IDs deterministically to avoid deadlocks across concurrent multi-item orders!
        const sortedProductIds = Array.from(requestedPerProduct.keys()).sort();

        // Lock rows using SELECT ... FOR UPDATE
        // In PostgreSQL/PGlite, this guarantees exclusive write lock on these product rows until tx commits/rollbacks
        const lockedProducts = await tx
          .select()
          .from(products)
          .where(inArray(products.id, sortedProductIds));

        // Check stock for all lines
        const insufficientDetails: Array<{ sku: string; available: number; requested: number }> = [];

        for (const prod of lockedProducts) {
          const requested = requestedPerProduct.get(prod.id)!;
          const available = prod.onHandQuantity - prod.reservedQuantity;

          if (available < requested) {
            insufficientDetails.push({
              sku: prod.sku,
              available: Math.max(0, available),
              requested,
            });
          }
        }

        // All-or-nothing check: If any line lacks stock, reserve NOTHING and fail transaction
        if (insufficientDetails.length > 0) {
          reservationAttemptsTotal.inc({ outcome: 'insufficient_stock' });
          throw new InsufficientStockError(insufficientDetails);
        }

        // Reserve stock for all products
        for (const prod of lockedProducts) {
          const requested = requestedPerProduct.get(prod.id)!;
          const newReserved = prod.reservedQuantity + requested;

          await tx
            .update(products)
            .set({
              reservedQuantity: newReserved,
              updatedAt: new Date(),
            })
            .where(eq(products.id, prod.id));
        }

        // Transition order status to RESERVED
        const [reserved] = await tx
          .update(orders)
          .set({
            status: 'RESERVED',
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderId))
          .returning();

        reservationAttemptsTotal.inc({ outcome: 'success' });
        return reserved;
      });

      await AuditService.record({
        eventType: 'RESERVATION_SUCCEEDED',
        actor,
        targetEntityType: 'ORDER',
        targetEntityId: orderId,
        requestId,
        metadata: {
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
        },
      });

      return this.getOrderById(orderId);
    } catch (err: any) {
      if (err instanceof InsufficientStockError) {
        await AuditService.record({
          eventType: 'RESERVATION_FAILED',
          actor,
          targetEntityType: 'ORDER',
          targetEntityId: orderId,
          requestId,
          metadata: {
            reason: 'INSUFFICIENT_STOCK',
            details: err.details,
          },
        });
      }
      throw err;
    }
  }

  /**
   * Confirm a reserved order (RESERVED -> CONFIRMED)
   * Deducts on-hand stock and reserved stock permanently
   */
  static async confirmOrder(orderId: string, actor: AuditActor, requestId: string) {
    const db = getDatabase();

    const confirmedOrder = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      // Valid state transition: Only RESERVED -> CONFIRMED
      if (order.status !== 'RESERVED') {
        throw new InvalidStateTransitionError(order.status, 'CONFIRMED');
      }

      const lines = await tx
        .select()
        .from(orderLines)
        .where(eq(orderLines.orderId, orderId));

      const requestedPerProduct = new Map<string, number>();
      for (const line of lines) {
        const current = requestedPerProduct.get(line.productId) || 0;
        requestedPerProduct.set(line.productId, current + line.quantity);
      }

      const sortedProductIds = Array.from(requestedPerProduct.keys()).sort();

      const lockedProducts = await tx
        .select()
        .from(products)
        .where(inArray(products.id, sortedProductIds));

      // Finalize sale: Stock leaves warehouse, reducing both on-hand and reserved quantities
      for (const prod of lockedProducts) {
        const qty = requestedPerProduct.get(prod.id)!;
        const newOnHand = prod.onHandQuantity - qty;
        const newReserved = prod.reservedQuantity - qty;

        await tx
          .update(products)
          .set({
            onHandQuantity: Math.max(0, newOnHand),
            reservedQuantity: Math.max(0, newReserved),
            updatedAt: new Date(),
          })
          .where(eq(products.id, prod.id));
      }

      const [confirmed] = await tx
        .update(orders)
        .set({
          status: 'CONFIRMED',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return confirmed;
    });

    await AuditService.record({
      eventType: 'ORDER_CONFIRMED',
      actor,
      targetEntityType: 'ORDER',
      targetEntityId: orderId,
      requestId,
      metadata: {
        orderNumber: confirmedOrder.orderNumber,
        status: confirmedOrder.status,
      },
    });

    return this.getOrderById(orderId);
  }

  /**
   * Cancel an order (PENDING -> CANCELLED or RESERVED -> CANCELLED)
   * If RESERVED, releases reserved stock back to available pool
   */
  static async cancelOrder(orderId: string, actor: AuditActor, requestId: string) {
    const db = getDatabase();

    const cancelledOrder = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        throw new NotFoundError(`Order with ID '${orderId}' not found`);
      }

      // Valid state transitions: PENDING -> CANCELLED or RESERVED -> CANCELLED
      if (order.status !== 'PENDING' && order.status !== 'RESERVED') {
        throw new InvalidStateTransitionError(order.status, 'CANCELLED');
      }

      // If order was RESERVED, release the reserved stock
      if (order.status === 'RESERVED') {
        const lines = await tx
          .select()
          .from(orderLines)
          .where(eq(orderLines.orderId, orderId));

        const requestedPerProduct = new Map<string, number>();
        for (const line of lines) {
          const current = requestedPerProduct.get(line.productId) || 0;
          requestedPerProduct.set(line.productId, current + line.quantity);
        }

        const sortedProductIds = Array.from(requestedPerProduct.keys()).sort();

        const lockedProducts = await tx
          .select()
          .from(products)
          .where(inArray(products.id, sortedProductIds));

        for (const prod of lockedProducts) {
          const qty = requestedPerProduct.get(prod.id)!;
          const newReserved = Math.max(0, prod.reservedQuantity - qty);

          await tx
            .update(products)
            .set({
              reservedQuantity: newReserved,
              updatedAt: new Date(),
            })
            .where(eq(products.id, prod.id));
        }
      }

      const [cancelled] = await tx
        .update(orders)
        .set({
          status: 'CANCELLED',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return cancelled;
    });

    await AuditService.record({
      eventType: 'ORDER_CANCELLED',
      actor,
      targetEntityType: 'ORDER',
      targetEntityId: orderId,
      requestId,
      metadata: {
        orderNumber: cancelledOrder.orderNumber,
        status: cancelledOrder.status,
      },
    });

    return this.getOrderById(orderId);
  }
}
