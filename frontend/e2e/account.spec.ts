import { expect, test } from '@playwright/test';
import {
  adminUser,
  interceptMutation,
  mockAuthAccounts,
  mockCommonApis,
  regularUser,
} from './helpers.js';

const testUser = adminUser({
  name: 'Test User',
  email: 'test@example.com',
  description: 'A test user description',
  phoneNumber: '+358401234567',
});

test.describe('Account page', () => {
  test.describe('data display', () => {
    test('shows personal information', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Personal information' })).toBeVisible();
      // The NavBar also shows the user name, so use nth(1) to get the one in the page content
      await expect(page.getByText('Test User').nth(1)).toBeVisible();
      await expect(page.getByText('test@example.com')).toBeVisible();
      await expect(page.getByText('+358401234567')).toBeVisible();
      await expect(page.getByText('A test user description')).toBeVisible();
    });

    test('shows login methods with connected providers', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await expect(page.getByRole('heading', { name: 'Login methods' })).toBeVisible();
      // Discord is connected -> shows Disconnect button
      const discordRow = page.locator('text=Discord').locator('..').locator('..');
      await expect(discordRow.getByRole('button', { name: 'Disconnect' })).toBeVisible();
      // Google and Microsoft are not connected -> show Connect buttons
      await expect(page.getByRole('button', { name: 'Connect Google' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Connect Microsoft' })).toBeVisible();
    });

    test('shows "cannot disconnect last login method" when only one account', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await expect(page.getByText('You cannot disconnect your last login method.')).toBeVisible();
      // Disconnect button should be disabled
      await expect(page.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
    });

    test('shows danger zone section', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await page.goto('/account');

      await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible();
    });
  });

  test.describe('editing personal info', () => {
    test('edit and save calls PATCH /users/@me with correct data', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);

      // Set up a route that fulfills PATCH but returns the user for GET
      await page.route('**/api/v1/users/@me', route => {
        if (route.request().method() === 'PATCH') {
          return route.fulfill({ json: { ...testUser, name: 'Updated Name' } });
        }
        return route.fulfill({ json: testUser });
      });

      await page.goto('/account');

      // Click Edit
      await page.getByRole('button', { name: 'Edit' }).click();

      // Change name
      const nameInput = page.getByRole('textbox', { name: 'Name' });
      await nameInput.fill('Updated Name');

      // Change phone number
      const phoneInput = page.getByRole('textbox', { name: 'Phone number' });
      await phoneInput.fill('+358409876543');

      // Set up the request listener before clicking Save
      const patchRequest = page.waitForRequest(
        req => req.url().includes('/api/v1/users/@me') && req.method() === 'PATCH',
      );

      // Save
      await page.getByRole('button', { name: 'Save' }).click();

      const request = await patchRequest;
      const body = request.postDataJSON();
      expect(body).toMatchObject({
        name: 'Updated Name',
        phoneNumber: '+358409876543',
      });
    });

    test('shows validation error for invalid email', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await page.getByRole('button', { name: 'Edit' }).click();

      const emailInput = page.getByRole('textbox', { name: 'Email' });
      await emailInput.fill('not-an-email');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('Enter a valid email address')).toBeVisible();
    });

    test('shows validation error for invalid phone number', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await page.getByRole('button', { name: 'Edit' }).click();

      const phoneInput = page.getByRole('textbox', { name: 'Phone number' });
      await phoneInput.fill('1234567');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('Phone number must include the country code')).toBeVisible();
    });

    test('cancel discards changes', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await page.getByRole('button', { name: 'Edit' }).click();
      const nameInput = page.getByRole('textbox', { name: 'Name' });
      await nameInput.fill('Changed');
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Original name shown again (nth(1) skips the NavBar copy)
      await expect(page.getByText('Test User').nth(1)).toBeVisible();
    });
  });

  test.describe('login methods', () => {
    test('disconnecting a login method calls DELETE endpoint', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
        { provider: 'google', providerAccountId: '456', createdAt: '2025-01-02T00:00:00.000Z' },
      ]);

      const captured = await interceptMutation(
        page,
        '**/api/v1/users/@me/auth-accounts/google',
        'DELETE',
      );

      await page.goto('/account');

      // Google row should have a Disconnect button (2 accounts, can disconnect)
      const googleRow = page.locator('text=Google').locator('..').locator('..');
      await googleRow.getByRole('button', { name: 'Disconnect' }).click();

      await expect
        .poll(() => captured.length, { message: 'DELETE auth-accounts/google was called' })
        .toBe(1);
    });
  });

  test.describe('account deletion', () => {
    test('delete account opens confirmation modal', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await page.getByRole('button', { name: 'Delete account' }).click();

      await expect(page.getByRole('heading', { name: 'Delete account?' })).toBeVisible();
      await expect(page.getByText(/permanently deletes your account/)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete my account' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
    });

    test('cancel in delete modal closes it', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await page.getByRole('button', { name: 'Delete account' }).click();
      await expect(page.getByRole('heading', { name: 'Delete account?' })).toBeVisible();

      await page.getByRole('button', { name: 'Cancel' }).click();
      await expect(page.getByRole('heading', { name: 'Delete account?' })).toHaveCount(0);
    });

    test('confirming delete calls DELETE /users/@me and shows login screen', async ({ page }) => {
      // First set up normal mocks so the page loads
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);

      let deleted = false;
      // Intercept the DELETE and subsequent GETs to /users/@me
      await page.route('**/api/v1/users/@me', route => {
        if (route.request().method() === 'DELETE') {
          deleted = true;
          return route.fulfill({ status: 204 });
        }
        // After deletion, GET requests should fail
        if (deleted) {
          return route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        }
        // Before deletion, return the user normally
        return route.fulfill({ json: testUser });
      });

      await page.goto('/account');

      await page.getByRole('button', { name: 'Delete account' }).click();
      await page.getByRole('button', { name: 'Delete my account' }).click();

      // Should be redirected to login screen
      await expect(page.getByText('Sign in to continue')).toBeVisible();
    });
  });

  test.describe('permission levels', () => {
    test('regular user can access account page and edit own info', async ({ page }) => {
      const regular = regularUser({ name: 'Regular User', email: 'regular@example.com' });
      await mockCommonApis(page, regular);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await page.goto('/account');

      await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
      await expect(page.getByText('Regular User').nth(1)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });
  });
});
