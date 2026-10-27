import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

// Load the committed test environment (backend/.env.test) before any src module
// is evaluated. dotenv does not override variables that are already set, so
// these values win over the development .env that src/config.ts loads.
config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)) });

// Importing src/database.js in test mode creates a PGlite instance (in-process
// WebAssembly Postgres) and a Kysely db backed by it. The top-level await in
// database.ts resolves before this import returns, so `pglite` is ready to use
// here. Test files import `db` from ../src/database.js and get the same
// instance (ES module caching within the worker).
const { pglite } = await import('../src/database.js');

if (!pglite) {
  throw new Error('PGlite instance not initialized; NODE_ENV must be "test"');
}

// Apply pending migrations and seed the permissions table. Each test worker
// (fork) gets its own fresh PGlite instance, so migrations run once per test
// file. PGlite does not support advisory locks, so noLock is set.
const { runner } = await import('node-pg-migrate');
const { createLogger } = await import('../src/logger.js');
const { createPgliteClient } = await import('./helpers/pglite-client.js');

const logger = createLogger('test-setup');
const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));

const applied = await runner({
  dbClient: createPgliteClient(pglite),
  direction: 'up',
  dir: migrationsDir,
  migrationsTable: 'pgmigrations',
  noLock: true,
  log: message => logger.info(message),
});

const { seedPermissions } = await import('../src/services/permission-service.js');
const seeded = await seedPermissions();
logger.info(
  `Test database ready: ${applied.length} migration(s) applied, ${seeded} permission(s) seeded`,
);
