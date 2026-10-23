export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number = 400, code: string = 'BAD_REQUEST', details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHENTICATED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Permission denied for this resource') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = 'CONFLICT', details?: unknown) {
    super(message, 409, code, details);
  }
}

export class InsufficientStockError extends AppError {
  constructor(details: Array<{ sku: string; available: number; requested: number }>) {
    super('One or more items cannot be reserved', 409, 'INSUFFICIENT_STOCK', details);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition order from status '${currentStatus}' to '${targetStatus}'`,
      409,
      'INVALID_STATE_TRANSITION',
      { currentStatus, targetStatus }
    );
  }
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId: string;
  };
}
