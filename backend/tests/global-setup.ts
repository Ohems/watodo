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
// reachable the setup is skipped and the integration tests skip themselves
// (they probe the database in beforeAll).
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
    logger.warn({ error }, 'Test database is not reachable; integration tests will be skipped');
    await disconnectDatabase().catch(() => {});
    return;
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
