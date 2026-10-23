import { defineConfig } from 'vitest/config';
import { config as loadDotenv } from 'dotenv';

// Lets TEST_DATABASE_URL live in the root .env. Real env vars still win.
loadDotenv({ path: '../../.env', quiet: true });

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false, // tests share one real PostgreSQL database
    hookTimeout: 30_000,
  },
});
