export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Set TEST_DATABASE_URL (a real PostgreSQL database) to run the tests.');
  }
  return url;
}

export const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(40),
  METRICS_TOKEN: 'm'.repeat(20),
  CORS_ORIGINS: 'http://localhost:5173, http://example.test',
};
