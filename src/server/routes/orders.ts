import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { OrderService } from '../services/orderService.ts';
import { IdempotencyService } from '../services/idempotencyService.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';

export const ordersRouter = Router();

const createOrderSchema = z.object({
  customerName: z.string().min(1).max(255),
  lines: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

// GET /api/v1/orders - List orders (Operator/Admin)
ordersRouter.get(
  '/',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orders = await OrderService.listOrders(50);
      res.json(orders);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/orders - Create pending order (Operator/Admin)
ordersRouter.post(
  '/',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = createOrderSchema.parse(req.body);
      const actor = {
        id: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };

      const order = await OrderService.createOrder(input, actor, req.id);
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/orders/:id - Retrieve order with lines and audit history
ordersRouter.get(
  '/:id',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const order = await OrderService.getOrderById(req.params.id);
      res.json(order);
    } catch (err) {
      next(err);
    }
  }
);

// Helper for idempotent mutation execution
async function handleIdempotentAction(
  req: Request,
  res: Response,
  next: NextFunction,
  actionFn: () => Promise<any>
) {
  const idempotencyKey = (req.headers['idempotency-key'] as string)?.trim();

  if (idempotencyKey) {
    try {
      const check = await IdempotencyService.checkAndAcquire(
        idempotencyKey,
        req.user!.userId,
        req.originalUrl,
        req.method,
        req.body
      );

      if (check.isCached) {
        return res.status(check.statusCode || 200).json(check.responseBody);
      }
    } catch (err) {
      return next(err);
    }
  }

  try {
    const result = await actionFn();

    if (idempotencyKey) {
      await IdempotencyService.complete(idempotencyKey, 200, result);
    }

    return res.json(result);
  } catch (err: any) {
    if (idempotencyKey) {
      await IdempotencyService.fail(
        idempotencyKey,
        err.statusCode || 500,
        {
          error: {
            code: err.code || 'INTERNAL_ERROR',
            message: err.message,
            details: err.details,
          },
        }
      );
    }
    return next(err);
  }
}

// POST /api/v1/orders/:id/reserve - Atomically reserve stock (Idempotent)
ordersRouter.post(
  '/:id/reserve',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const actor = {
      id: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    };

    await handleIdempotentAction(req, res, next, () =>
      OrderService.reserveOrder(req.params.id, actor, req.id)
    );
  }
);

// POST /api/v1/orders/:id/confirm - Confirm a reserved order (Idempotent)
ordersRouter.post(
  '/:id/confirm',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const actor = {
      id: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    };

    await handleIdempotentAction(req, res, next, () =>
      OrderService.confirmOrder(req.params.id, actor, req.id)
    );
  }
);

// POST /api/v1/orders/:id/cancel - Cancel pending or reserved order (Idempotent)
ordersRouter.post(
  '/:id/cancel',
  requireAuth,
  requireRole('ADMIN', 'OPERATOR'),
  async (req: Request, res: Response, next: NextFunction) => {
    const actor = {
      id: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    };

    await handleIdempotentAction(req, res, next, () =>
      OrderService.cancelOrder(req.params.id, actor, req.id)
    );
  }
);
