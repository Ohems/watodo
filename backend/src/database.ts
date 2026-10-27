import type { PGlite } from '@electric-sql/pglite';
import { Kysely, PGliteDialect, PostgresDialect } from 'kysely';
import pg from 'pg';
import { config } from './config.js';
import type { Database } from './db/types.js';
import { createLogger } from './logger.js';

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

  // Load a pre-built template (migrations + permissions already applied) when
  // available. The template is built once by tests/global-setup.ts (Vitest
  // globalSetup) and cached in the OS temp directory. Loading it takes ~350ms
  // instead of ~1500ms for a fresh initdb + migrations. The migration runner in
  // tests/setup.ts applies any new migrations on top, so a stale template is
  // self-healing. Keep the path in sync with tests/global-setup.ts.
  const { existsSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const templatePath = join(tmpdir(), 'watodo-pglite-template.tar.gz');

  if (existsSync(templatePath)) {
    const templateData = readFileSync(templatePath);
    pglite = new PGliteClass({
      ...perfOptions,
      loadDataDir: new File([templateData], 'pglite-template.tar.gz'),
    });
    logger.info('Test database loaded from template (PGlite)');
  } else {
    pglite = new PGliteClass(perfOptions);
    logger.info('Test database initialized (PGlite, no template found)');
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
