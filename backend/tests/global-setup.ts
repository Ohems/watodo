import { fileURLToPath } from 'node:url';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  interface ProvidedContext {
    /** Pre-migrated PGlite database snapshot (gzip tarball) built by this global setup. */
    pgliteTemplate: Uint8Array<ArrayBuffer>;
  }
}

/**
 * Vitest global setup: builds a pre-migrated PGlite database snapshot once per
 * test run and provides it to every worker via project.provide(). Each worker
 * retrieves it with inject() (tests/setup.ts) and loads it via PGlite's
 * `loadDataDir` (~350ms) instead of a fresh initdb + migrations (~1500ms).
 *
 * The snapshot is passed as a Uint8Array, not a file: the forks pool transmits
 * the provided context over IPC with advanced (v8) serialization, which
 * preserves typed arrays, so nothing is ever written to disk.
 */
async function buildTemplate(): Promise<Uint8Array<ArrayBuffer>> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { runner } = await import('node-pg-migrate');
  const { createPgliteClient } = await import('./helpers/pglite-client.js');
  const { PERMISSION_DEFINITIONS } = await import('../src/permissions.js');

  const pglite = new PGlite({
    relaxedDurability: true,
    postgresqlconf: [
      'synchronous_commit = off',
      'full_page_writes = off',
      'wal_level = minimal',
      'autovacuum = off',
      'checkpoint_timeout = 1h',
      'max_wal_size = 256MB',
    ],
  });
  await pglite.waitReady;

  const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
  await runner({
    dbClient: createPgliteClient(pglite),
    direction: 'up',
    dir: migrationsDir,
    migrationsTable: 'pgmigrations',
    noLock: true,
    log: () => {},
  });

  for (const perm of PERMISSION_DEFINITIONS) {
    await pglite.query(
      'INSERT INTO permissions (code, description) VALUES ($1, $2) ON CONFLICT (code) DO NOTHING',
      [perm.code, perm.description],
    );
  }

  // Flush WAL to data files so the dump captures everything.
  await pglite.query('CHECKPOINT');

  const dump = await pglite.dumpDataDir('gzip');
  const template = new Uint8Array(await dump.arrayBuffer());

  await pglite.close();

  return template;
}

export default async function globalSetup(project: TestProject): Promise<void> {
  const template = await buildTemplate();
  project.provide('pgliteTemplate', template);
}
