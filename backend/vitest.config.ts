import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Loads backend/.env.test so integration tests run against the dedicated
    // test database (port 6432) instead of the development database.
    setupFiles: ['tests/setup.ts'],
    // Applies migrations and seeds permissions in the test database once
    // before the test files run.
    globalSetup: ['tests/global-setup.ts'],
    // Integration tests share a single database and assert on table
    // contents, so test files must not run in parallel.
    fileParallelism: false,
    // Use the forks pool instead of the default vmThreads pool. The vmThreads
    // pool in vitest 5 / vite 8 crashes on Node 24 when source map lookups
    // encounter non-string module code (code.charCodeAt is not a function).
    pool: 'forks',
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
