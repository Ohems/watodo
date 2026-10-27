import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

// Load the committed test environment (backend/.env.test) before any src module
// is imported, so the migration runner and the database pool below connect to
// the test database (port 6432) instead of the development database. dotenv
// does not override variables that are already set.
dotenvConfig({ path: fileURLToPath(new URL('../.env.test', import.meta.url)) });

// Runs once before all test files: applies pending migrations and seeds the
// permissions table in the test database, so integration tests run against a
// real schema without any manual setup step. When the test database is not
// reachable the setup throws, failing the whole test run instead of letting
// tests skip silently.
export default async function setup(): Promise<void> {
  // Imported dynamically so that the dotenv call above runs first.
  const { runner } = await import('node-pg-migrate');
  const { sql } = await import('kysely');
  const { config } = await import('../src/config.js');
  const { db, disconnectDatabase } = await import('../src/database.js');
  const { createLogger } = await import('../src/logger.js');
  const { seedPermissions } = await import('../src/services/permission-service.js');

  const logger = createLogger('test-global-setup');
  const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

  try {
    await sql`select 1`.execute(db);
  } catch (error) {
    await disconnectDatabase().catch(() => {});
    // Log before throwing: the thrown error fails the run, but vitest's error
    // printer can mangle its output (vite source-map crash on Node 24), so the
    // reason is also logged directly.
    logger.error(
      { error },
      'Test database is not reachable; the backend test suite requires it. Start it with `docker compose up -d`.',
    );
    throw new Error('Test database is not reachable', { cause: error });
  }

  try {
    const applied = await runner({
      databaseUrl: config.databaseUrl,
      direction: 'up',
      dir: migrationsDir,
      migrationsTable: 'pgmigrations',
      log: message => logger.info(message),
    });
    const seeded = await seedPermissions();
    logger.info(
      `Test database ready: ${applied.length} migration(s) applied, ${seeded} permission(s) seeded`,
    );
  } finally {
    await disconnectDatabase().catch(() => {});
  }
}
