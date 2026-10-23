import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProductService } from '../services/productService.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';

export const productsRouter = Router();

const createProductSchema = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  unitPrice: z.number().int().nonnegative(),
  initialOnHandQuantity: z.number().int().nonnegative().optional(),
});

const adjustStockSchema = z.object({
  delta: z.number().int(),
  reason: z.string().min(1).max(1000),
});

// GET /api/v1/products - List products with pagination
productsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));

    const result = await ProductService.listProducts(page, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/products - Create a product (ADMIN only)
productsRouter.post('/', requireAuth, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const input = createProductSchema.parse(req.body);
    const actor = {
      id: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    };

    const product = await ProductService.createProduct(input, actor, req.id);
    res.status(201).json(product);
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/products/:id - Retrieve product details
productsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const product = await ProductService.getProductById(req.params.id);
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/products/:id/adjustments - Adjust on-hand stock with reason (ADMIN only)
productsRouter.post(
  '/:id/adjustments',
  requireAuth,
  requireRole('ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = adjustStockSchema.parse(req.body);
      const actor = {
        id: req.user!.userId,
        email: req.user!.email,
        role: req.user!.role,
      };

      const product = await ProductService.adjustStock(req.params.id, input, actor, req.id);
      res.json(product);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/products/:id/adjustments - View stock-adjustment history
productsRouter.get('/:id/adjustments', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const history = await ProductService.getAdjustmentHistory(req.params.id);
    res.json(history);
  } catch (err) {
    next(err);
  }
});
