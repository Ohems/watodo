import { expect, test } from '@playwright/test';
import { adminUser, createOrganization, mockCommonApis } from './helpers.js';

const testOrg = createOrganization({ name: 'Acme Events' });
const secondOrg = createOrganization({ id: 'org-2', name: 'Beta Org' });

test.describe('NavBar', () => {
  test.describe('data display', () => {
    test('shows the logo, navigation items, user name, and organization selector', async ({
      page,
    }) => {
      await mockCommonApis(page, adminUser({ name: 'Alice' }), [testOrg, secondOrg]);
      await page.goto('/');

      // Logo
      await expect(page.getByAltText('WATODO').first()).toBeVisible();

      // Navigation items (Home and Teams are links, Events and Organization are dropdown buttons)
      await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Events' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Teams' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Organization' })).toBeVisible();

      // User name
      await expect(page.getByText('Alice')).toBeVisible();

      // Organization selector
      await expect(page.getByRole('combobox', { name: 'Select organization' })).toBeVisible();
    });

    test('shows the active organization in the selector', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg, secondOrg]);
      await page.goto('/');

      const orgSelect = page.getByRole('combobox', { name: 'Select organization' });
      await expect(orgSelect).toHaveValue('Acme Events');
    });
  });

  test.describe('navigation', () => {
    test('clicking Home navigates to /', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/users');

      await page.getByRole('link', { name: 'Home' }).click();
      await expect(page).toHaveURL('/');
    });

    test('clicking Teams navigates to /teams', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      await page.getByRole('link', { name: 'Teams' }).click();
      await expect(page).toHaveURL('/teams');
    });

    test('Events dropdown shows Calendar and Management links', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      // Hover over Events to open dropdown
      await page.getByRole('button', { name: 'Events' }).hover();

      await expect(page.getByRole('menuitem', { name: 'Calendar' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Management' })).toBeVisible();
    });

    test('Organization dropdown shows General, Sites, Work Roles, Users links', async ({
      page,
    }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      await page.getByRole('button', { name: 'Organization' }).hover();

      await expect(page.getByRole('menuitem', { name: 'General' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Sites' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Work Roles' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Users' })).toBeVisible();
    });

    test('clicking Calendar in Events dropdown navigates to calendar', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      await page.getByRole('button', { name: 'Events' }).hover();
      await page.getByRole('menuitem', { name: 'Calendar' }).click();
      await expect(page).toHaveURL('/events/calendar');
    });
  });

  test.describe('user menu', () => {
    /** The settings button contains the user avatar; find it by the avatar alt text. */
    function settingsButton(page: import('@playwright/test').Page) {
      return page.locator('header button').filter({ has: page.locator('[class*="Avatar"]') });
    }

    test('clicking the avatar opens the settings menu', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      await settingsButton(page).click();

      await expect(page.getByRole('menuitem', { name: 'Profile' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Account' })).toBeVisible();
      await expect(page.getByRole('menuitem', { name: 'Logout' })).toBeVisible();
    });

    test('clicking Profile navigates to /profile', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      await settingsButton(page).click();
      await page.getByRole('menuitem', { name: 'Profile' }).click();
      await expect(page).toHaveURL('/profile');
    });

    test('clicking Account navigates to /account', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/');

      await settingsButton(page).click();
      await page.getByRole('menuitem', { name: 'Account' }).click();
      await expect(page).toHaveURL('/account');
    });

    test('clicking Logout clears the session and shows the login screen', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.route('**/api/v1/auth/logout', route => route.fulfill({ status: 204 }));

      // After logout, intercept the current-user refetch and return 401.
      // The logout thunk clears the token then resets API state, which triggers
      // a refetch of useGetCurrentUserQuery without the x-token header.
      await page.route('**/api/v1/users/@me', async route => {
        const token = await route.request().headerValue('x-token');
        if (!token) {
          return route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        }
        return route.fulfill({ json: adminUser() });
      });

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

      await settingsButton(page).click();
      await page.getByRole('menuitem', { name: 'Logout' }).click();

      await expect(page.getByText('Sign in to continue')).toBeVisible();
    });
  });

  test.describe('organization switching', () => {
    test('switching organization updates the selector', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg, secondOrg]);
      await page.goto('/');

      const orgSelect = page.getByRole('combobox', { name: 'Select organization' });
      await expect(orgSelect).toHaveValue('Acme Events');

      // Switch to Beta Org
      await orgSelect.click();
      await page.getByRole('option', { name: 'Beta Org' }).click();

      await expect(orgSelect).toHaveValue('Beta Org');
    });
  });
});

test.describe('Error page (404)', () => {
  test('shows error page for unknown routes when authenticated', async ({ page }) => {
    await mockCommonApis(page, adminUser(), [testOrg]);
    await page.goto('/nonexistent-route');

    await expect(page.getByRole('heading', { name: 'Oops!' })).toBeVisible();
    await expect(page.getByText(/was not found/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go Home' })).toBeVisible();
  });
});

test.describe('No Organization page', () => {
  test('shows no organization message when user has no orgs', async ({ page }) => {
    await mockCommonApis(page, adminUser(), []);
    // Mock the profile page which checks for org
    await page.route(`**/api/v1/organizations/${''}/my/work-roles`, route =>
      route.fulfill({ json: [] }),
    );
    await page.goto('/profile');

    await expect(
      page.getByText(
        'You are not a member of any organization yet. Please contact an administrator to be added to one.',
      ),
    ).toBeVisible();
  });
});
