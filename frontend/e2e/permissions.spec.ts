import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  mockCommonApis,
  mockMyWorkRolesAndCerts,
  mockOrgApis,
  mockUsersList,
  ORG_ID,
  regularUser,
  userWithPermissions,
} from './helpers.js';

const testOrg = createOrganization();

const mockSites = [
  {
    id: 'site-1',
    name: 'Main Hall',
    description: 'The main hall',
    address: '123 Main St',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockWorkRoles = [
  {
    id: 1,
    name: 'Setup Crew',
    description: 'Sets up the venue',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockTeams = [
  {
    id: 'team-1',
    name: 'Setup Team',
    description: '',
    organizationId: ORG_ID,
    memberCount: 2,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockUsers = [
  {
    id: 'user-1',
    name: 'Alice Anderson',
    email: 'alice@example.com',
    description: '',
    phoneNumber: null,
    permissions: ['admin'],
    state: 'active',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

/**
 * Permission matrix tests: verifies that users with different permission
 * levels see the correct UI elements on each page.
 */

test.describe('Permission matrix', () => {
  test.describe('Organization General page', () => {
    const permissions = [
      { label: 'admin', user: adminUser(), expectEdit: true },
      {
        label: 'organization:write',
        user: userWithPermissions(['organization:write']),
        expectEdit: true,
      },
      { label: 'no permissions', user: regularUser(), expectEdit: false },
    ];

    for (const { label, user, expectEdit } of permissions) {
      test(`${label} ${expectEdit ? 'sees' : 'does not see'} the Edit button`, async ({ page }) => {
        await mockCommonApis(page, user, [testOrg]);
        await page.goto('/organization/general');

        await expect(page.getByRole('heading', { name: 'Test Org' })).toBeVisible();
        if (expectEdit) {
          await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
        } else {
          await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
        }
      });
    }
  });

  test.describe('Organization Sites page', () => {
    const permissions = [
      { label: 'admin', user: adminUser(), expectAdd: true },
      {
        label: 'site-management:write',
        user: userWithPermissions(['site-management:write']),
        expectAdd: true,
      },
      { label: 'no permissions', user: regularUser(), expectAdd: false },
    ];

    for (const { label, user, expectAdd } of permissions) {
      test(`${label} ${expectAdd ? 'sees' : 'does not see'} the Add button`, async ({ page }) => {
        await mockCommonApis(page, user, [testOrg]);
        await mockOrgApis(page, ORG_ID, { sites: mockSites });
        await page.goto('/organization/sites');

        await expect(page.getByText('Main Hall').first()).toBeVisible();
        if (expectAdd) {
          await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
        } else {
          await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
        }
      });
    }
  });

  test.describe('Organization Work Roles page', () => {
    const permissions = [
      { label: 'admin', user: adminUser(), expectAdd: true },
      {
        label: 'work-role-management:write',
        user: userWithPermissions(['work-role-management:write']),
        expectAdd: true,
      },
      { label: 'no permissions', user: regularUser(), expectAdd: false },
    ];

    for (const { label, user, expectAdd } of permissions) {
      test(`${label} ${expectAdd ? 'sees' : 'does not see'} the Add button`, async ({ page }) => {
        await mockCommonApis(page, user, [testOrg]);
        await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles });
        await page.goto('/organization/work-roles');

        await expect(page.getByText('Setup Crew')).toBeVisible();
        if (expectAdd) {
          await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
        } else {
          await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
        }
      });
    }
  });

  test.describe('Teams page', () => {
    const permissions = [
      { label: 'admin', user: adminUser(), expectAdd: true },
      {
        label: 'team-management:write',
        user: userWithPermissions(['team-management:write']),
        expectAdd: true,
      },
      { label: 'no permissions', user: regularUser(), expectAdd: false },
    ];

    for (const { label, user, expectAdd } of permissions) {
      test(`${label} ${expectAdd ? 'sees' : 'does not see'} the Add button`, async ({ page }) => {
        await mockCommonApis(page, user, [testOrg]);
        await mockOrgApis(page, ORG_ID, { teams: mockTeams });
        await page.goto('/teams');

        await expect(page.getByText('Setup Team')).toBeVisible();
        if (expectAdd) {
          await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
        } else {
          await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
        }
      });
    }
  });

  test.describe('Site Config page', () => {
    const mockSite = mockSites[0];

    async function setupSiteConfig(
      page: import('@playwright/test').Page,
      user: ReturnType<typeof adminUser>,
    ) {
      await mockCommonApis(page, user, [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: [] });
      await page.route(`**/api/v1/organizations/${ORG_ID}/sites/site-1`, route =>
        route.fulfill({ json: mockSite }),
      );
      await page.route(`**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms?*`, route =>
        route.fulfill({ json: { items: [], total: 0, page: 0, limit: 50 } }),
      );
    }

    test('admin sees Edit button for site', async ({ page }) => {
      await setupSiteConfig(page, adminUser());
      await page.goto('/organization/sites/site-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    test('site-management:write user sees Edit button for site', async ({ page }) => {
      await setupSiteConfig(page, userWithPermissions(['site-management:write']));
      await page.goto('/organization/sites/site-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    test('regular user does not see Edit button for site', async ({ page }) => {
      await setupSiteConfig(page, regularUser());
      await page.goto('/organization/sites/site-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Main Hall' })).toBeVisible();
    });

    test('room-management:write user sees Add button for rooms but not Edit for site', async ({
      page,
    }) => {
      await setupSiteConfig(page, userWithPermissions(['room-management:write']));
      await page.goto('/organization/sites/site-1');

      // No site edit
      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      // But room Add button is visible
      const roomsSection = page.getByRole('heading', { name: 'Rooms' }).locator('..');
      await expect(roomsSection.getByRole('button', { name: 'Add' })).toBeVisible();
    });
  });

  test.describe('Profile page (self-service)', () => {
    test('any authenticated user can manage their own work roles', async ({ page }) => {
      // Profile page is self-service, no special permissions needed
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles, certifications: [] });
      await mockMyWorkRolesAndCerts(page, ORG_ID, { workRoles: [], certifications: [] });
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
      await expect(page.getByPlaceholder('Add a role...')).toBeVisible();
    });
  });

  test.describe('Contacts page', () => {
    test('any authenticated user can view contacts', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockUsersList(page, mockUsers);
      await page.goto('/users');

      await expect(page.getByText('Alice Anderson')).toBeVisible();
    });
  });

  test.describe('Account page', () => {
    test('any authenticated user can access account page', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await page.route('**/api/v1/users/@me/auth-accounts', route => route.fulfill({ json: [] }));
      await page.goto('/account');

      await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });
  });

  test.describe('Home page', () => {
    test('any authenticated user sees home page', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    });
  });
});
