import { z } from 'zod';

// Every setting comes from the environment and is validated once, at startup.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  METRICS_TOKEN: z.string().min(16, 'must be at least 16 characters'),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  LOGIN_RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // List variable names and problems only. Never print the values (they may be secrets).
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
