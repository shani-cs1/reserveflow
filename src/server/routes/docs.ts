import { Router, Request, Response } from 'express';

export const docsRouter = Router();

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'ReserveFlow Inventory Reservation API',
    version: '1.0.0',
    description:
      'Production-oriented inventory reservation API with row-level transaction locking, atomic all-or-nothing reservations, persistent idempotency, and append-only audit trail.',
    contact: {
      name: 'ReserveFlow Operations Engineering',
      email: 'operations@reserveflow.local',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API Version 1',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Provide JWT token obtained from POST /api/v1/auth/login',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'INSUFFICIENT_STOCK' },
              message: { type: 'string', example: 'One or more items cannot be reserved' },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string', example: 'PUMP-001' },
                    available: { type: 'integer', example: 2 },
                    requested: { type: 'integer', example: 5 },
                  },
                },
              },
              requestId: { type: 'string', example: 'req_019a2b3c4d5e' },
            },
            required: ['code', 'message', 'requestId'],
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', example: 'your-password' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          sku: { type: 'string', example: 'PUMP-001' },
          name: { type: 'string', example: 'Centrifugal Water Pump 1HP' },
          unitPrice: { type: 'integer', description: 'Price in minor currency units (cents)', example: 45000 },
          onHandQuantity: { type: 'integer', example: 50 },
          reservedQuantity: { type: 'integer', example: 10 },
          availableQuantity: { type: 'integer', example: 40 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateProductRequest: {
        type: 'object',
        required: ['sku', 'name', 'unitPrice'],
        properties: {
          sku: { type: 'string', example: 'VALVE-900' },
          name: { type: 'string', example: 'High Pressure Brass Valve' },
          unitPrice: { type: 'integer', example: 8500 },
          initialOnHandQuantity: { type: 'integer', example: 100 },
        },
      },
      StockAdjustmentRequest: {
        type: 'object',
        required: ['delta', 'reason'],
        properties: {
          delta: { type: 'integer', description: 'Positive or negative stock change', example: 25 },
          reason: { type: 'string', example: 'Monthly physical inventory reconciliation' },
        },
      },
      CreateOrderRequest: {
        type: 'object',
        required: ['customerName', 'lines'],
        properties: {
          customerName: { type: 'string', example: 'Apex Industrial Supply Corp' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              required: ['productId', 'quantity'],
              properties: {
                productId: { type: 'string', format: 'uuid' },
                quantity: { type: 'integer', minimum: 1, example: 5 },
              },
            },
          },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          orderNumber: { type: 'string', example: 'ORD-20261023-A7K2' },
          customerName: { type: 'string', example: 'Apex Industrial Supply Corp' },
          status: { type: 'string', enum: ['PENDING', 'RESERVED', 'CONFIRMED', 'CANCELLED'] },
          totalAmount: { type: 'integer', example: 225000 },
          createdBy: { type: 'string', format: 'uuid' },
          creatorEmail: { type: 'string' },
          lines: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                productId: { type: 'string', format: 'uuid' },
                sku: { type: 'string' },
                productName: { type: 'string' },
                unitPriceSnapshot: { type: 'integer' },
                quantity: { type: 'integer' },
                lineTotal: { type: 'integer' },
              },
            },
          },
          auditHistory: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                eventType: { type: 'string' },
                actorEmail: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                metadata: { type: 'object' },
              },
            },
          },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        summary: 'Authenticate and receive JWT token',
        tags: ['Authentication'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Authenticated successfully' },
          '401': { description: 'Invalid email or password' },
        },
      },
    },
    '/products': {
      get: {
        summary: 'List products with inventory quantities',
        tags: ['Products'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          '200': { description: 'Paginated product inventory' },
        },
      },
      post: {
        summary: 'Create a new product (ADMIN role required)',
        tags: ['Products'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateProductRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Product created successfully' },
          '409': { description: 'Duplicate SKU conflict' },
        },
      },
    },
    '/products/{id}': {
      get: {
        summary: 'Retrieve product details',
        tags: ['Products'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Product details' },
          '404': { description: 'Product not found' },
        },
      },
    },
    '/products/{id}/adjustments': {
      get: {
        summary: 'View stock-adjustment history',
        tags: ['Products'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Stock adjustment history' },
        },
      },
      post: {
        summary: 'Adjust on-hand inventory with required reason (ADMIN role required)',
        tags: ['Products'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/StockAdjustmentRequest' },
            },
          },
        },
        responses: {
          '200': { description: 'Stock adjusted successfully' },
          '409': { description: 'Invalid stock adjustment (would result in negative or under-reserved stock)' },
        },
      },
    },
    '/orders': {
      get: {
        summary: 'List orders (Operator or Admin)',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'List of orders' },
        },
      },
      post: {
        summary: 'Create a pending order with snapshot pricing',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateOrderRequest' },
            },
          },
        },
        responses: {
          '201': { description: 'Order created in PENDING state' },
        },
      },
    },
    '/orders/{id}': {
      get: {
        summary: 'Retrieve order with line items and audit timeline',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'Order details' },
          '404': { description: 'Order not found' },
        },
      },
    },
    '/orders/{id}/reserve': {
      post: {
        summary: 'Atomically reserve stock for all order lines (All-or-nothing)',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', example: 'idem_res_order_123' },
            description: 'Unique key to guarantee idempotent retries',
          },
        ],
        responses: {
          '200': { description: 'Order transitioned to RESERVED state' },
          '409': {
            description: 'Insufficient stock or invalid state transition',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/orders/{id}/confirm': {
      post: {
        summary: 'Confirm a reserved order, completing the sale',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Order transitioned to CONFIRMED' },
          '409': { description: 'Invalid state transition' },
        },
      },
    },
    '/orders/{id}/cancel': {
      post: {
        summary: 'Cancel an order, releasing reserved stock if previously reserved',
        tags: ['Orders'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: {
          '200': { description: 'Order transitioned to CANCELLED and stock released' },
          '409': { description: 'Invalid state transition' },
        },
      },
    },
    '/audit-events': {
      get: {
        summary: 'List recent append-only audit events (ADMIN role required)',
        tags: ['Audit'],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: {
          '200': { description: 'Recent audit events, newest first' },
          '401': { description: 'Authentication required' },
          '403': { description: 'ADMIN role required' },
        },
      },
    },
    '/health/live': {
      get: {
        summary: 'Liveness probe',
        tags: ['Health'],
        responses: { '200': { description: 'Service is alive' } },
      },
    },
    '/health/ready': {
      get: {
        summary: 'Readiness probe verifying database connectivity',
        tags: ['Health'],
        responses: {
          '200': { description: 'Database connected and ready' },
          '503': { description: 'Database disconnected' },
        },
      },
    },
    '/metrics': {
      get: {
        summary: 'Prometheus metrics endpoint',
        description:
          'When METRICS_TOKEN is configured, authenticate with that bearer token or the token query parameter. Otherwise an authenticated ADMIN JWT is required.',
        tags: ['Observability'],
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Prometheus text metrics' },
          '401': { description: 'Authentication required or invalid metrics token' },
          '403': { description: 'ADMIN role required when no metrics token is configured' },
        },
      },
    },
  },
};

docsRouter.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpec);
});

docsRouter.get('/', (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ReserveFlow - API Documentation</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
  <style>
    body { margin: 0; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .topbar { background-color: #0f172a; padding: 12px 20px; color: white; display: flex; align-items: center; justify-content: space-between; }
    .topbar h1 { margin: 0; font-size: 1.15rem; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .topbar a { color: #38bdf8; text-decoration: none; font-size: 0.9rem; }
    .swagger-ui .topbar { display: none; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>📦 ReserveFlow OpenAPI 3.0 Interactive Documentation</h1>
    <a href="/docs/openapi.json" target="_blank">Download OpenAPI JSON</a>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: '/docs/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});
