import type { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from './config.js';
import type { Database } from './db/types.js';
import { createLogger } from './logger.js';
import { getPgliteTemplate } from './pglite-template.js';

const logger = createLogger('database');

const { Pool } = pg;

let db: Kysely<Database>;

/**
 * The raw PGlite instance, only set in test mode. Exported so the test setup
 * can pass it to the migration runner (node-pg-migrate expects a pg client).
 */
export let pglite: PGlite | undefined;

if (config.nodeEnv === 'test') {
  // PGlite: in-process WebAssembly Postgres, so the test suite runs without a
  // Docker container. The dynamic import keeps @electric-sql/pglite (a
  // devDependency) out of the production build; it is only loaded when this
  // module is evaluated in test mode.
  //
  // Performance options for tests (durability is irrelevant for ephemeral
  // test databases):
  // - relaxedDurability: PGlite does not wait for storage flushes after each
  //   query. In Node.js with an in-memory filesystem this is mostly a no-op,
  //   but it does no harm.
  // - postgresqlconf: non-durable PostgreSQL settings that speed up writes.
  //   fsync is already off via the default -F start param; these additional
  //   settings skip WAL flushes on commit, reduce WAL volume, and disable
  //   background autovacuum.
  const perfOptions = {
    relaxedDurability: true,
    postgresqlconf: [
      'synchronous_commit = off',
      'full_page_writes = off',
      'wal_level = minimal',
      'autovacuum = off',
      'checkpoint_timeout = 1h',
      'max_wal_size = 256MB',
    ],
  };

  const { PGlite: PGliteClass } = await import('@electric-sql/pglite');

  // Load the pre-built snapshot (migrations + permissions already applied) when
  // available. The snapshot is built once per test run by tests/global-setup.ts
  // (Vitest globalSetup) and passed to this worker via provide()/inject() as a
  // Uint8Array (stored by tests/setup.ts in pglite-template.ts before this
  // module is imported). Loading it takes ~350ms instead of ~1500ms for a
  // fresh initdb + migrations. The migration runner in tests/setup.ts applies
  // any new migrations on top, so a stale snapshot is self-healing.
  const template = getPgliteTemplate();

  if (template) {
    pglite = new PGliteClass({
      ...perfOptions,
      loadDataDir: new File([template], 'pglite-template.tar.gz', { type: 'application/gzip' }),
    });
    logger.info('Test database loaded from provided snapshot (PGlite)');
  } else {
    pglite = new PGliteClass(perfOptions);
    logger.info('Test database initialized (PGlite, no snapshot provided)');
  }

  db = new Kysely<Database>({
    dialect: new PGliteDialect({ pglite }),
  });
} else {
  db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: config.databaseUrl,
        max: 10,
      }),
    }),
  });
}

export { db };

export async function connectDatabase(): Promise<void> {
  try {
    await db.selectFrom('users').select('id').limit(1).execute();
    logger.info('Database connected');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to database');
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await db.destroy();
  logger.info('Database disconnected');
}
