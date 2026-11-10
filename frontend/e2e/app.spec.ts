import { expect, test } from '@playwright/test';
import { gotoApp, mockAuthProviders } from './helpers.js';

// The provider list is always mocked: the login page has no hardcoded
// fallback, and no E2E test should reach a real backend.
test.beforeEach(async ({ page }) => {
  await mockAuthProviders(page);
});

test.describe('Watodo App', () => {
  test('greets an unauthorized user with the login screen', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page.getByAltText('Watodo')).toBeVisible();
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });

  test('does not show the navigation bar when not authenticated', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page.getByText('Sign in to continue')).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('offers a login link for every supported provider', async ({ page }) => {
    await gotoApp(page, '/');
    await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Microsoft' })).toBeVisible();
  });

  test('provider links point at the backend login endpoints', async ({ page }) => {
    await gotoApp(page, '/');
    const discord = page.getByRole('link', { name: 'Sign in with Discord' });
    await expect(discord).toHaveAttribute('href', /\/api\/v1\/auth\/discord\/login\?/);
  });

  test('shows the login screen on other routes too', async ({ page }) => {
    await gotoApp(page, '/users');
    await expect(page.getByText('Sign in to continue')).toBeVisible();

    await gotoApp(page, '/nonexistent-route');
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });

  test('shows the no-providers message when the server responds with an empty provider list', async ({
    page,
  }) => {
    // Later route registrations win over the beforeEach mock.
    await page.route('**/api/v1/auth/providers', route =>
      route.fulfill({ json: { providers: [] } }),
    );
    await gotoApp(page, '/');
    await expect(page.getByText('No login methods are configured on this server.')).toBeVisible();
  });

  test('shows a service-unavailable message when the backend is unreachable', async ({ page }) => {
    // Later route registrations win over the beforeEach mock; aborting the
    // request simulates the backend being down.
    await page.route('**/api/v1/auth/providers', route => route.abort());
    await gotoApp(page, '/');
    await expect(page.getByText(/The service is currently unavailable/)).toBeVisible();
    await expect(page.getByText('No login methods are configured on this server.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Sign in with/ })).toHaveCount(0);
  });
});
