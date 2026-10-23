import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors.ts';
import { logger } from '../utils/logger.ts';
import { databaseErrorsTotal } from '../utils/metrics.ts';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.id || 'unknown';

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
  }

  // Handle Zod validation errors
  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload validation failed',
        details: err.issues || err.errors,
        requestId,
      },
    });
  }

  // Handle PostgreSQL error codes (e.g. unique constraint 23505, check constraint 23514)
  if (err?.code === '23505') {
    databaseErrorsTotal.inc({ operation: 'unique_violation' });
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_KEY',
        message: 'A resource with this key or identifier already exists',
        details: err.detail,
        requestId,
      },
    });
  }

  if (err?.code === '23514') {
    databaseErrorsTotal.inc({ operation: 'check_violation' });
    return res.status(409).json({
      error: {
        code: 'INVARIANT_VIOLATION',
        message: 'Operation violates inventory state invariants (stock cannot be negative or oversold)',
        details: err.constraint,
        requestId,
      },
    });
  }

  // Unhandled internal server error
  logger.error({
    err,
    requestId,
    msg: 'Unhandled internal server error',
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal server error occurred',
      requestId,
    },
  });
}
