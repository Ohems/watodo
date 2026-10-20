import { expect, test } from '@playwright/test';

test.describe('Watodo App', () => {
  test('homepage loads and shows the navigation bar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('banner')).toBeVisible();
    // WATODO title appears in the navbar (desktop and mobile)
    await expect(page.getByText('WATODO').first()).toBeVisible();
  });

  test('navigation links are visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Calendar' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Contacts' })).toBeVisible();
  });

  test('can navigate to Contacts page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Contacts' }).click();
    await expect(page).toHaveURL(/\/users/);
    await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
  });

  test('can navigate to Organization page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Organization' }).click();
    await expect(page).toHaveURL(/\/organization/);
    await expect(page.getByRole('heading', { name: 'No Organization' })).toBeVisible();
  });

  test('unknown route shows error page', async ({ page }) => {
    await page.goto('/nonexistent-route');
    await expect(page.getByText('Oops!')).toBeVisible();
  });

  test('user menu opens on avatar click', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open settings' }).click();
    await expect(page.getByText('Profile')).toBeVisible();
    await expect(page.getByText('Logout')).toBeVisible();
  });

  test('homepage shows calendar heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible();
  });
});
