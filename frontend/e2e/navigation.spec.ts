import { expect, test } from '@playwright/test';

test.describe('Navigation', () => {
  test('logo links to home', async ({ page }) => {
    await page.goto('/users');
    await page.getByText('WATODO').first().click();
    await expect(page).toHaveURL('/');
  });

  test('browser back button works', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Contacts' }).click();
    await expect(page).toHaveURL(/\/users/);
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('error page handles unknown routes', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.getByText('Oops!')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible();
  });
});
