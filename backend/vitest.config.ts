import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Builds a pre-migrated PGlite template once (cached in the OS temp dir by
    // mtime) so each worker can load it via loadDataDir instead of a fresh
    // initdb + migrations.
    globalSetup: 'tests/global-setup.ts',
    // Loads backend/.env.test, creates a PGlite instance (in-process
    // WebAssembly Postgres) per test worker, applies migrations and seeds the
    // permissions table. No external database or Docker container is needed.
    // Each test file gets its own fork with its own PGlite instance, so test
    // files can run in parallel safely.
    setupFiles: ['tests/setup.ts'],
    // Use the forks pool instead of the default vmThreads pool. The vmThreads
    // pool in vitest 5 / vite 8 crashes on Node 24 when source map lookups
    // encounter non-string module code (code.charCodeAt is not a function).
    pool: 'forks',
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
