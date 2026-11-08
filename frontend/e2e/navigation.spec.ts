import { expect, test } from '@playwright/test';
import { mockAuthProviders } from './helpers.js';

// The provider list is always mocked: the login page has no hardcoded
// fallback, and no E2E test should reach a real backend.
test.beforeEach(async ({ page }) => {
  await mockAuthProviders(page);
});

test.describe('Navigation', () => {
  test('login links carry the current page as the return URL', async ({ page }) => {
    await page.goto('/users');
    const link = page.getByRole('link', { name: 'Sign in with Discord' });
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('returnUrl=');
    // The return URL is the current page, whatever host/port the test runs on.
    expect(decodeURIComponent(href as string)).toContain(page.url());
  });

  test('the login screen is shown for every route when unauthenticated', async ({ page }) => {
    for (const route of ['/', '/users', '/organization', '/nonexistent-route']) {
      await page.goto(route);
      await expect(page.getByText('Sign in to continue')).toBeVisible();
    }
  });
});
