import { initDatabase, closeDatabase } from './index.ts';
import { logger } from '../utils/logger.ts';

export async function runMigrations() {
  logger.info({ msg: 'Running database migrations...' });
  await initDatabase();
  logger.info({ msg: 'Database migrations verified and applied successfully.' });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(async () => {
      console.log('Migration finished successfully.');
      await closeDatabase();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration error:', err);
      process.exit(1);
    });
}
