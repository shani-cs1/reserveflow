// Side-effect import: loads the repo-root .env into process.env (local development only).
// Variables already set in the real environment (Docker, CI) are never overridden.
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
