import { existsSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Vitest global setup: builds a pre-migrated PGlite database template and
 * caches it in the OS temp directory. Each test worker loads the template via
 * PGlite's `loadDataDir` (~350ms) instead of a fresh initdb + migrations
 * (~1500ms).
 *
 * The template path is shared with `src/database.ts` (keep in sync). The cache
 * is invalidated by comparing mtimes: if any migration file or the permissions
 * registry is newer than the template, it is rebuilt.
 */
const templatePath = join(tmpdir(), 'watodo-pglite-template.tar.gz');

function getSourceMtimes(): number[] {
  const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
  const mtimes = readdirSync(migrationsDir)
    .filter(file => file.endsWith('.ts'))
    .map(file => statSync(join(migrationsDir, file)).mtimeMs);
  mtimes.push(statSync(fileURLToPath(new URL('../src/permissions.ts', import.meta.url))).mtimeMs);
  return mtimes;
}

function isTemplateFresh(): boolean {
  if (!existsSync(templatePath)) return false;
  const templateMtime = statSync(templatePath).mtimeMs;
  return getSourceMtimes().every(mtime => mtime <= templateMtime);
}

async function buildTemplate(): Promise<void> {
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
  const buffer = Buffer.from(await dump.arrayBuffer());

  // Write atomically: temp file + rename.
  const tempPath = `${templatePath}.tmp`;
  writeFileSync(tempPath, buffer);
  renameSync(tempPath, templatePath);

  await pglite.close();
}

export default async function globalSetup(): Promise<void> {
  if (!isTemplateFresh()) {
    await buildTemplate();
  }
}
