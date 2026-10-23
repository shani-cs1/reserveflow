import './env.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db/client.js';

function loadConfigOrExit() {
  try {
    return loadConfig(); // fail fast: bad/missing env stops the process before it listens
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
const config = loadConfigOrExit();

const pool = createPool(config.DATABASE_URL);
const app = await buildApp({ config, pool });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'shutting down');

  // Hard stop if in-flight requests don't finish in time.
  const timer = setTimeout(() => {
    app.log.error('shutdown timed out, forcing exit');
    process.exit(1);
  }, config.SHUTDOWN_TIMEOUT_MS);
  timer.unref();

  try {
    await app.close(); // stop accepting new requests, wait for active ones
    await pool.end(); // then close database connections
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'error during shutdown');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ port: config.PORT, host: '0.0.0.0' });
