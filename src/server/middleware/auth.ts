import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService.ts';
import { AuthenticationError, ForbiddenError } from '../utils/errors.ts';

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('Missing or invalid Authorization header'));
  }

  const token = authHeader.substring(7).trim();
  try {
    const payload = AuthService.verifyToken(token);
    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles: Array<'ADMIN' | 'OPERATOR'>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Action requires role '${allowedRoles.join(' or ')}', but user has role '${req.user.role}'`
        )
      );
    }

    next();
  };
}
