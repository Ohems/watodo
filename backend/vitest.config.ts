import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Builds a pre-migrated PGlite snapshot once per test run and provides it
    // to each worker via provide()/inject() as a Uint8Array (no files written),
    // so each worker can load it via loadDataDir instead of a fresh initdb +
    // migrations.
    globalSetup: 'tests/global-setup.ts',
    // Loads backend/.env.test, injects the PGlite snapshot provided by the
    // global setup, creates a PGlite instance (in-process WebAssembly
    // Postgres) per test worker, applies migrations and seeds the permissions
    // table. No external database or Docker container is needed.
    // Each test file gets its own fork with its own PGlite instance, so test
    // files can run in parallel safely.
    setupFiles: ['tests/setup.ts'],
    // Use the forks pool instead of the default vmThreads pool. The vmThreads
    // pool in vitest 5 / vite 8 crashes on Node 24 when source map lookups
    // encounter non-string module code (code.charCodeAt is not a function).
    pool: 'forks',
    // Disable the on-disk module transform cache. vitest 5.0.5 reads cached
    // modules with readFile() without an encoding, so their code reaches
    // vite 8.3.5's module runner as a Buffer; when vite then maps an error
    // stack, extractInlineSourceMap crashes with "code.charCodeAt is not a
    // function" and hides the real error (vitest-dev/vitest#11682, fixed
    // upstream by #11709 but not yet released). With the fs cache off, module
    // code is always a string and stack mapping works on Node 24.
    fsModuleCache: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
