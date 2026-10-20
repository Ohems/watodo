import { expect, test } from '@playwright/test';

test.describe('Navigation', () => {
  test('login links carry the current page as the return URL', async ({ page }) => {
    await page.goto('/users');
    const link = page.getByRole('link', { name: 'Sign in with Discord' });
    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href).toContain('returnUrl=');
    expect(decodeURIComponent(href as string)).toContain('http://localhost:5173/users');
  });

  test('the login screen is shown for every route when unauthenticated', async ({ page }) => {
    for (const route of ['/', '/users', '/organization', '/nonexistent-route']) {
      await page.goto(route);
      await expect(page.getByText('Sign in to continue')).toBeVisible();
    }
  });
});
