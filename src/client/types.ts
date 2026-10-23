export type UserRole = 'ADMIN' | 'OPERATOR';

export interface User {
  userId: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  unitPrice: number; // in cents
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  createdAt: string;
  updatedAt: string;
}

export type OrderStatus = 'PENDING' | 'RESERVED' | 'CONFIRMED' | 'CANCELLED';

export interface OrderLine {
  id: string;
  orderId: string;
  productId: string;
  sku: string;
  productName: string;
  unitPriceSnapshot: number;
  quantity: number;
  lineTotal: number;
}

export interface AuditEvent {
  id: string;
  eventType: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  targetEntityType: string;
  targetEntityId: string;
  requestId: string;
  metadata: Record<string, any>;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  createdBy: string;
  creatorEmail: string;
  createdAt: string;
  updatedAt: string;
  lines: OrderLine[];
  auditHistory?: AuditEvent[];
}

export interface StockAdjustment {
  id: string;
  productId: string;
  delta: number;
  previousOnHand: number;
  newOnHand: number;
  reason: string;
  actorId: string;
  actorEmail: string;
  createdAt: string;
}

export interface ApiErrorDetail {
  sku?: string;
  available?: number;
  requested?: number;
  [key: string]: any;
}

export interface ApiError {
  code: string;
  message: string;
  details?: ApiErrorDetail[] | any;
  requestId: string;
}
