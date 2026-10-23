import { ApiError, Order, Product, StockAdjustment, User } from './types.ts';

const TOKEN_KEY = 'reserveflow_auth_token';
const USER_KEY = 'reserveflow_auth_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const data = localStorage.getItem(USER_KEY);
  if (!data) return null;
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function storeAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function generateIdempotencyKey(prefix: string = 'key'): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now()}_${rand}`;
}

async function request<T>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401) {
      clearAuth();
    }
    const apiError: ApiError = data?.error || {
      code: 'REQUEST_FAILED',
      message: typeof data === 'string' ? data : 'An unexpected request failure occurred',
      requestId: response.headers.get('x-request-id') || 'unknown',
    };
    throw apiError;
  }

  return data as T;
}

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<{ token: string; user: User }> => {
    const res = await request<{ token: string; user: User }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    storeAuth(res.token, res.user);
    return res;
  },

  getCurrentUser: async (): Promise<{ user: User }> => {
    return request<{ user: User }>('/api/v1/auth/me');
  },

  // Products
  getProducts: async (page: number = 1, limit: number = 50): Promise<{ items: Product[]; pagination: any }> => {
    return request<{ items: Product[]; pagination: any }>(`/api/v1/products?page=${page}&limit=${limit}`);
  },

  getProduct: async (id: string): Promise<Product> => {
    return request<Product>(`/api/v1/products/${id}`);
  },

  createProduct: async (data: {
    sku: string;
    name: string;
    unitPrice: number;
    initialOnHandQuantity?: number;
  }): Promise<Product> => {
    return request<Product>('/api/v1/products', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  adjustStock: async (id: string, data: { delta: number; reason: string }): Promise<Product> => {
    return request<Product>(`/api/v1/products/${id}/adjustments`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getStockHistory: async (id: string): Promise<StockAdjustment[]> => {
    return request<StockAdjustment[]>(`/api/v1/products/${id}/adjustments`);
  },

  // Orders
  getOrders: async (): Promise<Order[]> => {
    return request<Order[]>('/api/v1/orders');
  },

  getOrder: async (id: string): Promise<Order> => {
    return request<Order>(`/api/v1/orders/${id}`);
  },

  createOrder: async (data: {
    customerName: string;
    lines: Array<{ productId: string; quantity: number }>;
  }): Promise<Order> => {
    return request<Order>('/api/v1/orders', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  reserveOrder: async (id: string, idempotencyKey?: string): Promise<Order> => {
    return request<Order>(`/api/v1/orders/${id}/reserve`, {
      method: 'POST',
      idempotencyKey: idempotencyKey || generateIdempotencyKey('res'),
    });
  },

  confirmOrder: async (id: string, idempotencyKey?: string): Promise<Order> => {
    return request<Order>(`/api/v1/orders/${id}/confirm`, {
      method: 'POST',
      idempotencyKey: idempotencyKey || generateIdempotencyKey('cfm'),
    });
  },

  cancelOrder: async (id: string, idempotencyKey?: string): Promise<Order> => {
    return request<Order>(`/api/v1/orders/${id}/cancel`, {
      method: 'POST',
      idempotencyKey: idempotencyKey || generateIdempotencyKey('cnl'),
    });
  },

  // Audit Events
  getAuditEvents: async (limit: number = 50): Promise<any[]> => {
    return request<any[]>(`/api/v1/audit-events?limit=${limit}`);
  },
};
