import { expect, test } from '@playwright/test';

test.describe('Watodo App', () => {
  test('greets an unauthorized user with the login screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('WATODO').first()).toBeVisible();
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });

  test('does not show the navigation bar when not authenticated', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sign in to continue')).toBeVisible();
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('offers a login link for every supported provider', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Sign in with Discord' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Google' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in with Microsoft' })).toBeVisible();
  });

  test('provider links point at the backend login endpoints', async ({ page }) => {
    await page.goto('/');
    const discord = page.getByRole('link', { name: 'Sign in with Discord' });
    await expect(discord).toHaveAttribute('href', /\/api\/v1\/auth\/discord\/login\?/);
  });

  test('shows the login screen on other routes too', async ({ page }) => {
    await page.goto('/users');
    await expect(page.getByText('Sign in to continue')).toBeVisible();

    await page.goto('/nonexistent-route');
    await expect(page.getByText('Sign in to continue')).toBeVisible();
  });
});
