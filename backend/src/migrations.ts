import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import pg from 'pg';
import { config } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('migrations');

/**
 * Applies pending database migrations with node-pg-migrate (enabled via
 * AUTO_MIGRATE=true). The migrations directory is resolved relative to this
 * file, so it works both from src/ (tsx dev server) and dist/ (production
 * build). node-pg-migrate loads the TypeScript migration files itself.
 */
export async function runMigrations(): Promise<void> {
  const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
  const client = new pg.Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    const applied = await runner({
      dbClient: client,
      direction: 'up',
      dir: migrationsDir,
      migrationsTable: 'pgmigrations',
      log: message => logger.info(message),
    });
    logger.info(`Applied ${applied.length} migration(s)`);
  } finally {
    await client.end();
  }
}
