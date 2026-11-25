import { expect, type Page, test } from '@playwright/test';
import {
  adminUser,
  gotoApp,
  interceptMutation,
  mockAuthAccounts,
  mockCommonApis,
  mockMailStatus,
  mockNotificationPreferences,
  mockPushApis,
  regularUser,
} from './helpers.js';

const testUser = adminUser({
  name: 'Test User',
  email: 'test@example.com',
  description: 'A test user description',
  phoneNumber: '+358401234567',
});

/**
 * Stubs the browser push APIs (service worker, PushManager, Notification) via
 * an init script so the push section renders its switch in every browser and
 * the subscribe/unsubscribe flow can run without a real push service.
 */
async function stubPushApis(page: Page, options: { existingEndpoint?: string } = {}) {
  await page.addInitScript(existingEndpoint => {
    const endpoint = existingEndpoint ?? 'https://push.example.com/e2e-sub';
    const subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-secret' } }),
      unsubscribe: () => Promise.resolve(true),
    };
    const pushManager = {
      subscribe: () => Promise.resolve(subscription),
      getSubscription: () => Promise.resolve(existingEndpoint ? subscription : null),
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }), register: () => Promise.resolve() },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'default', requestPermission: () => Promise.resolve('granted') },
    });
  }, options.existingEndpoint ?? null);
}

test.describe('Account page', () => {
  test.describe('data display', () => {
    test('shows personal information', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);
      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

      await expect(page.getByText('You cannot disconnect your last login method.')).toBeVisible();
      // Disconnect button should be disabled
      await expect(page.getByRole('button', { name: 'Disconnect' })).toBeDisabled();
    });

    test('shows danger zone section', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      await expect(page.getByRole('heading', { name: 'Danger zone' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible();
    });

    test('shows the language preference with the current language', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
      await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('English (UK)');
    });
  });

  test.describe('language preference', () => {
    test('changing the language calls PATCH /users/@me with the selected language', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, [
        { provider: 'discord', providerAccountId: '123', createdAt: '2025-01-01T00:00:00.000Z' },
      ]);

      // One route handling both GET and PATCH on the same URL; the language
      // is kept in a variable so refetches return the updated user.
      let currentLanguage = testUser.language;
      await page.route('**/api/v1/users/@me', route => {
        const request = route.request();
        if (request.method() === 'PATCH') {
          const body = request.postDataJSON() as { language?: string };
          currentLanguage = body.language ?? currentLanguage;
        }
        return route.fulfill({ json: { ...testUser, language: currentLanguage } });
      });

      await gotoApp(page, '/account');

      const patchRequest = page.waitForRequest(
        req => req.url().includes('/api/v1/users/@me') && req.method() === 'PATCH',
      );

      await page.getByRole('combobox', { name: 'Language' }).click();
      await page.getByRole('option', { name: 'Suomi' }).click();

      const request = await patchRequest;
      expect(request.postDataJSON()).toEqual({ language: 'fi' });
      // The UI switches to Finnish immediately (the label is Finnish now).
      await expect(page.getByRole('combobox', { name: 'Kieli' })).toHaveValue('Suomi');
    });
  });

  test.describe('week start preference', () => {
    test('shows the week start preference with the current week start', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      await expect(page.getByRole('combobox', { name: 'Week starts on' })).toHaveValue('Sunday');
    });

    test('changing the week start calls PATCH /users/@me with the selected value', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);

      // One route handling both GET and PATCH on the same URL; the week start
      // is kept in a variable so refetches return the updated user.
      let currentWeekStart = testUser.weekStart;
      await page.route('**/api/v1/users/@me', route => {
        const request = route.request();
        if (request.method() === 'PATCH') {
          const body = request.postDataJSON() as { weekStart?: string };
          currentWeekStart = body.weekStart ?? currentWeekStart;
        }
        return route.fulfill({ json: { ...testUser, weekStart: currentWeekStart } });
      });

      await gotoApp(page, '/account');

      const patchRequest = page.waitForRequest(
        req => req.url().includes('/api/v1/users/@me') && req.method() === 'PATCH',
      );

      await page.getByRole('combobox', { name: 'Week starts on' }).click();
      await page.getByRole('option', { name: 'Monday' }).click();

      const request = await patchRequest;
      expect(request.postDataJSON()).toEqual({ weekStart: 'monday' });
      await expect(page.getByRole('combobox', { name: 'Week starts on' })).toHaveValue('Monday');
    });
  });

  test.describe('date and time format preferences', () => {
    test('show the current formats', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      await expect(page.getByRole('combobox', { name: 'Date format' })).toHaveValue(
        'YYYY-MM-DD (year-month-day)',
      );
      await expect(page.getByRole('combobox', { name: 'Time format' })).toHaveValue(
        '24-hour clock (14:30)',
      );
    });

    test('changing the date format calls PATCH /users/@me with the selected value', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);

      let currentDateFormat = testUser.dateFormat;
      await page.route('**/api/v1/users/@me', route => {
        const request = route.request();
        if (request.method() === 'PATCH') {
          const body = request.postDataJSON() as { dateFormat?: string };
          currentDateFormat = body.dateFormat ?? currentDateFormat;
        }
        return route.fulfill({ json: { ...testUser, dateFormat: currentDateFormat } });
      });

      await gotoApp(page, '/account');

      const patchRequest = page.waitForRequest(
        req => req.url().includes('/api/v1/users/@me') && req.method() === 'PATCH',
      );

      await page.getByRole('combobox', { name: 'Date format' }).click();
      await page.getByRole('option', { name: 'MM/DD/YYYY (month-day-year)' }).click();

      const request = await patchRequest;
      expect(request.postDataJSON()).toEqual({ dateFormat: 'mdy' });
      await expect(page.getByRole('combobox', { name: 'Date format' })).toHaveValue(
        'MM/DD/YYYY (month-day-year)',
      );
    });

    test('changing the time format calls PATCH /users/@me with the selected value', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);

      let currentTimeFormat = testUser.timeFormat;
      await page.route('**/api/v1/users/@me', route => {
        const request = route.request();
        if (request.method() === 'PATCH') {
          const body = request.postDataJSON() as { timeFormat?: string };
          currentTimeFormat = body.timeFormat ?? currentTimeFormat;
        }
        return route.fulfill({ json: { ...testUser, timeFormat: currentTimeFormat } });
      });

      await gotoApp(page, '/account');

      const patchRequest = page.waitForRequest(
        req => req.url().includes('/api/v1/users/@me') && req.method() === 'PATCH',
      );

      await page.getByRole('combobox', { name: 'Time format' }).click();
      await page.getByRole('option', { name: '12-hour clock (2:30 PM)' }).click();

      const request = await patchRequest;
      expect(request.postDataJSON()).toEqual({ timeFormat: '12h' });
      await expect(page.getByRole('combobox', { name: 'Time format' })).toHaveValue(
        '12-hour clock (2:30 PM)',
      );
    });
  });

  test.describe('notification settings', () => {
    test('shows the notification settings card grouped into categories, without a welcome toggle', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      // One stored override: email for cancellations is off.
      await mockNotificationPreferences(page, [
        { messageKey: 'eventCancelled', channel: 'email', enabled: false },
      ]);
      await gotoApp(page, '/account');

      await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();
      // The settings are split into the General and Management categories.
      await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible();
      // Channel columns, once per category table.
      await expect(page.getByRole('columnheader', { name: 'In app' })).toHaveCount(2);
      await expect(page.getByRole('columnheader', { name: 'Email' })).toHaveCount(2);
      await expect(page.getByRole('columnheader', { name: 'Push' })).toHaveCount(2);
      // One row per notification type (exact match: the toggle cells contain
      // the type name in their switch labels too). The welcome type has no
      // toggle; manager-only alerts sit in the Management section.
      await expect(
        page.getByRole('cell', { name: 'Work role assigned', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Event cancelled', exact: true })).toBeVisible();
      await expect(
        page.getByRole('cell', { name: 'Unfilled critical role alert', exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('cell', { name: 'Welcome', exact: true })).toHaveCount(0);
      // Defaults: in-app and email on, push off; the override is off.
      await expect(page.getByRole('switch', { name: 'Work role assigned - In app' })).toBeChecked();
      await expect(
        page.getByRole('switch', { name: 'Work role assigned - Push' }),
      ).not.toBeChecked();
      await expect(page.getByRole('switch', { name: 'Event cancelled - Email' })).not.toBeChecked();
      await expect(
        page.getByRole('switch', { name: 'Unfilled critical role alert - In app' }),
      ).toBeChecked();
    });

    test('toggling a switch calls PATCH with the type, channel and new value', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      const toggle = page.getByRole('switch', { name: 'Work role assigned - Push' });
      await expect(toggle).not.toBeChecked();

      const patchRequest = page.waitForRequest(
        req =>
          req.url().includes('/api/v1/users/@me/notification-preferences/') &&
          req.method() === 'PATCH',
      );

      // Click the switch's wrapping label: the visually hidden input itself
      // never receives the hit (the track overlays it).
      await page.locator('label', { has: toggle }).click();

      const request = await patchRequest;
      expect(request.url()).toContain(
        '/api/v1/users/@me/notification-preferences/workRoleAssigned/push',
      );
      expect(request.postDataJSON()).toEqual({ enabled: true });
      // The preferences refetch and the toggle reflects the saved value.
      await expect(toggle).toBeChecked();
    });

    test('toggling an in-app notification off saves enabled=false', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      const toggle = page.getByRole('switch', { name: 'Event cancelled - In app' });
      await expect(toggle).toBeChecked();

      const patchRequest = page.waitForRequest(
        req =>
          req.url().includes('/api/v1/users/@me/notification-preferences/') &&
          req.method() === 'PATCH',
      );

      // Click the switch's wrapping label: the visually hidden input itself
      // never receives the hit (the track overlays it).
      await page.locator('label', { has: toggle }).click();

      const request = await patchRequest;
      expect(request.url()).toContain(
        '/api/v1/users/@me/notification-preferences/eventCancelled/in_app',
      );
      expect(request.postDataJSON()).toEqual({ enabled: false });
      await expect(toggle).not.toBeChecked();
    });

    test('shows a note when email delivery is not configured on the server', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      // Later registrations take precedence, so this overrides the default
      // (configured) mail status from mockCommonApis.
      await mockMailStatus(page, { configured: false });
      await gotoApp(page, '/account');

      await expect(page.getByText(/Email delivery is not configured on this server/)).toBeVisible();
    });

    test('shows no email note when email delivery is configured', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible();
      await expect(page.getByText(/Email delivery is not configured on this server/)).toHaveCount(
        0,
      );
    });

    test('shows the push notification section in the notification settings', async ({ page }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await gotoApp(page, '/account');

      await expect(page.getByRole('heading', { name: 'Push notifications' })).toBeVisible();
      // Depending on the browser's native push support: the enable switch or
      // the not-supported hint.
      const toggle = page.getByRole('switch', {
        name: 'Enable push notifications on this device',
      });
      const hint = page.getByText(/does not support push notifications/);
      await expect(toggle.or(hint)).toBeVisible();
      if ((await toggle.count()) > 0) {
        await expect(toggle).not.toBeChecked();
      }
    });

    test('enabling push notifications subscribes in the browser and registers the endpoint', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await stubPushApis(page);
      await gotoApp(page, '/account');

      const toggle = page.getByRole('switch', {
        name: 'Enable push notifications on this device',
      });
      await expect(toggle).not.toBeChecked();

      const postRequest = page.waitForRequest(
        req =>
          req.url().includes('/api/v1/users/@me/push-subscriptions') && req.method() === 'POST',
      );
      // Click the switch's wrapping label: the visually hidden input itself
      // never receives the hit (the track overlays it).
      await page.locator('label', { has: toggle }).click();

      const request = await postRequest;
      const body = request.postDataJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
        userAgent?: string;
      };
      expect(body.endpoint).toBe('https://push.example.com/e2e-sub');
      expect(body.keys).toEqual({ p256dh: 'p256dh-key', auth: 'auth-secret' });
      expect(typeof body.userAgent).toBe('string');
      // The subscriptions refetch and the toggle reflects the registration.
      await expect(toggle).toBeChecked();
    });

    test('disabling push notifications unsubscribes in the browser and deletes the endpoint', async ({
      page,
    }) => {
      await mockCommonApis(page, testUser);
      await mockAuthAccounts(page, []);
      await mockPushApis(page, {
        subscriptions: [
          {
            id: 3,
            endpoint: 'https://push.example.com/e2e-sub',
            userAgent: 'e2e-agent',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      });
      await stubPushApis(page, { existingEndpoint: 'https://push.example.com/e2e-sub' });
      await gotoApp(page, '/account');

      const toggle = page.getByRole('switch', {
        name: 'Enable push notifications on this device',
      });
      await expect(toggle).toBeChecked();

      const deleteRequest = page.waitForRequest(
        req =>
          req.url().includes('/api/v1/users/@me/push-subscriptions/') && req.method() === 'DELETE',
      );
      await page.locator('label', { has: toggle }).click();

      const request = await deleteRequest;
      expect(request.url()).toContain('/api/v1/users/@me/push-subscriptions/3');
      await expect(toggle).not.toBeChecked();
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

      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

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

      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

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

      await gotoApp(page, '/account');

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
      await gotoApp(page, '/account');

      await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
      await expect(page.getByText('Regular User').nth(1)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      // The language preference is self-service: no permission required.
      await expect(page.getByRole('combobox', { name: 'Language' })).toHaveValue('English (UK)');
    });
  });
});
