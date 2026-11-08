import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Every E2E test must complete within 20 seconds. This keeps the suite fast
  // and catches tests that hang on missing elements or slow API mocks.
  timeout: 20_000,
  expect: {
    timeout: 5_000,
  },
  reporter: 'html',
  use: {
    // The E2E tests run against a dedicated `vite preview` instance on its
    // own port, so they never clash with a dev server the developer may be
    // running on 5173.
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      // Dedicated frontend for the tests: a production build served by
      // `vite preview` on port 4173. Always started fresh (rebuild included),
      // never reusing another instance, so tests always run current code.
      command: 'npm run build && npm run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: false,
      timeout: 120 * 1000,
    },
  ],
});
