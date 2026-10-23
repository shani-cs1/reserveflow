import client from 'prom-client';

// Collect default system metrics (memory, CPU, event loop)
const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'reserveflow_' });

// HTTP request counter
export const httpRequestsTotal = new client.Counter({
  name: 'reserveflow_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['route', 'method', 'status_class'],
  registers: [register],
});

// Request duration histogram
export const httpRequestDurationSeconds = new client.Histogram({
  name: 'reserveflow_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['route', 'method', 'status_class'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

// Reservation attempts by outcome
export const reservationAttemptsTotal = new client.Counter({
  name: 'reserveflow_reservation_attempts_total',
  help: 'Total number of inventory reservation attempts by outcome',
  labelNames: ['outcome'], // 'success' | 'insufficient_stock' | 'invalid_state' | 'conflict' | 'error'
  registers: [register],
});

// Database errors counter
export const databaseErrorsTotal = new client.Counter({
  name: 'reserveflow_database_errors_total',
  help: 'Total number of database errors encountered',
  labelNames: ['operation'],
  registers: [register],
});

export async function getMetrics(): Promise<string> {
  return register.metrics();
}

export function getContentType(): string {
  return register.contentType;
}
