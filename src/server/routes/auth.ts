import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthService } from '../services/authService.ts';
import { requireAuth } from '../middleware/auth.ts';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await AuthService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  res.json({ user: req.user });
});
