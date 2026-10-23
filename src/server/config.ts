import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().optional(),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().default('reserveflow-dev-secret-key-must-be-changed-in-prod-12345'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  CORS_ORIGIN: z.string().default('*'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  METRICS_TOKEN: z.string().optional(),
  DEMO_SEED: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  process.exit(1);
}

const KNOWN_DEFAULT_JWT_SECRETS = new Set([
  'reserveflow-dev-secret-key-must-be-changed-in-prod-12345',
  'reserveflow_jwt_secret_key_change_in_production_9921',
  'ci-testing-jwt-secret-key-12345',
]);

if (parsed.data.NODE_ENV === 'production') {
  const secret = parsed.data.JWT_SECRET;

  if (
    !process.env.JWT_SECRET ||
    !secret ||
    secret.length < 32 ||
    KNOWN_DEFAULT_JWT_SECRETS.has(secret)
  ) {
    console.error(
      'FATAL: Production requires an explicit, non-default JWT_SECRET of at least 32 characters.'
    );
    process.exit(1);
  }

  if (parsed.data.DEMO_SEED) {
    console.error('FATAL: DEMO_SEED cannot be enabled when NODE_ENV=production.');
    process.exit(1);
  }
}

export const config = parsed.data;
