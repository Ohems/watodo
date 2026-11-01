// Clears the database referenced by DATABASE_URL by dropping and recreating
// the public schema. `npm run db:reset` chains this with `npm run migrate`,
// so the database is rebuilt from scratch (all migrations re-applied, which
// also re-seeds the permissions table). Run from backend/.
//
// This is needed because the initial migration is edited in place while the
// project is in early development: node-pg-migrate records 001_init as applied
// and never re-runs it on an existing database.

import pg from 'pg';
import { config } from '../src/config.js';
import { createLogger } from '../src/logger.js';

const logger = createLogger('reset-database');

async function main(): Promise<void> {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not set.');
  }
  if (config.nodeEnv === 'test') {
    throw new Error(
      'Refusing to reset in test mode: the test suite uses PGlite, not DATABASE_URL.',
    );
  }
  if (config.nodeEnv === 'production' && !process.argv.includes('--force')) {
    throw new Error('Refusing to reset in production mode. Pass --force to override.');
  }

  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    logger.info('Database cleared: public schema dropped and recreated.');
  } finally {
    await client.end();
  }
}

main().catch(error => {
  logger.fatal({ err: error }, 'Failed to reset the database');
  process.exit(1);
});
