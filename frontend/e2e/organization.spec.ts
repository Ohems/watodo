import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  interceptMutation,
  mockCommonApis,
  mockOrgApis,
  ORG_ID,
  regularUser,
  userWithPermissions,
} from './helpers.js';

const testOrg = createOrganization({
  name: 'Acme Events',
  description: 'We organize community events',
  defaultTimezone: 'Europe/Helsinki',
});

// ---------------------------------------------------------------------------
// Organization General page
// ---------------------------------------------------------------------------

test.describe('Organization General page', () => {
  test.describe('data display', () => {
    test('shows organization details', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/organization/general');

      await expect(page.getByRole('heading', { name: 'Acme Events' })).toBeVisible();
      await expect(page.getByText('We organize community events')).toBeVisible();
      await expect(page.getByText('Europe/Helsinki')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees the Edit button', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/organization/general');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    test('user with organization:write sees the Edit button', async ({ page }) => {
      await mockCommonApis(page, userWithPermissions(['organization:write']), [testOrg]);
      await page.goto('/organization/general');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    test('regular user (no permissions) does not see the Edit button', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await page.goto('/organization/general');

      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      // But still sees the data
      await expect(page.getByRole('heading', { name: 'Acme Events' })).toBeVisible();
    });
  });

  test.describe('editing', () => {
    test('admin can edit and save organization calls PATCH endpoint', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);

      const updatedOrg = { ...testOrg, name: 'Acme Events Updated' };
      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}`,
        'PATCH',
        updatedOrg,
      );

      await page.goto('/organization/general');

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit organization' })).toBeVisible();

      const nameInput = page.getByRole('textbox', { name: 'Name' });
      await nameInput.fill('Acme Events Updated');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /organizations/org-1 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Acme Events Updated' });
    });

    test('shows validation error for empty name', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/organization/general');

      await page.getByRole('button', { name: 'Edit' }).click();
      const nameInput = page.getByRole('textbox', { name: 'Name' });
      await nameInput.fill('');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('Name is required')).toBeVisible();
    });
  });
});

// ---------------------------------------------------------------------------
// Organization Sites page
// ---------------------------------------------------------------------------

const mockSites = [
  {
    id: 'site-1',
    name: 'Main Hall',
    description: 'The main event hall',
    address: '123 Main Street',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'site-2',
    name: 'Outdoor Area',
    description: null,
    address: null,
    organizationId: ORG_ID,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

test.describe('Organization Sites page', () => {
  test.describe('data display', () => {
    test('shows sites in a table', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites });
      await page.goto('/organization/sites');

      await expect(page.getByRole('heading', { name: 'Sites' })).toBeVisible();
      await expect(page.getByText('Main Hall').first()).toBeVisible();
      await expect(page.getByText('123 Main Street')).toBeVisible();
      await expect(page.getByText('The main event hall')).toBeVisible();
      await expect(page.getByText('Outdoor Area')).toBeVisible();
    });

    test('shows empty state when no sites', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: [] });
      await page.goto('/organization/sites');

      await expect(page.getByText('No results found')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees the Add button', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites });
      await page.goto('/organization/sites');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('user with site-management:write sees the Add button', async ({ page }) => {
      await mockCommonApis(page, userWithPermissions(['site-management:write']), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites });
      await page.goto('/organization/sites');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('regular user does not see the Add button', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites });
      await page.goto('/organization/sites');

      await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
      // But still sees the data
      await expect(page.getByText('Main Hall').first()).toBeVisible();
    });
  });

  test.describe('creating a site', () => {
    test('admin can create a site and POST is called', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: [] });

      const newSite = {
        id: 'site-new',
        name: 'New Site',
        description: 'A brand new site',
        address: '456 Side Street',
        organizationId: ORG_ID,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/sites`,
        'POST',
        newSite,
      );

      await page.goto('/organization/sites');
      await page.getByRole('button', { name: 'Add' }).click();

      await expect(page.getByRole('heading', { name: 'New site' })).toBeVisible();

      await page.getByRole('textbox', { name: 'Name' }).fill('New Site');
      await page.getByRole('textbox', { name: 'Description' }).fill('A brand new site');
      await page.getByRole('textbox', { name: 'Address' }).fill('456 Side Street');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect.poll(() => captured.length, { message: 'POST /sites was called' }).toBe(1);
      expect(captured[0].body).toMatchObject({
        name: 'New Site',
        description: 'A brand new site',
        address: '456 Side Street',
      });
    });
  });

  test.describe('navigation', () => {
    test('clicking a site row navigates to site config', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites });
      await page.goto('/organization/sites');

      await page.getByText('Main Hall').click();
      await expect(page).toHaveURL('/organization/sites/site-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Site Config page
// ---------------------------------------------------------------------------

const mockSite = mockSites[0];
const mockRooms = [
  {
    id: 'room-1',
    name: 'Conference Room A',
    description: 'Large conference room',
    siteId: 'site-1',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'room-2',
    name: 'Conference Room B',
    description: '',
    siteId: 'site-1',
    organizationId: ORG_ID,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

async function mockSiteDetail(page: import('@playwright/test').Page, siteId = 'site-1') {
  await page.route(
    url =>
      url.pathname === `/api/v1/organizations/${ORG_ID}/sites/${siteId}` &&
      !url.searchParams.has('page'),
    route => route.fulfill({ json: mockSite }),
  );
  await page.route(
    url =>
      url.pathname === `/api/v1/organizations/${ORG_ID}/sites/${siteId}/rooms` &&
      url.searchParams.has('page'),
    route =>
      route.fulfill({ json: { items: mockRooms, total: mockRooms.length, page: 0, limit: 50 } }),
  );
}

test.describe('Site Config page', () => {
  test.describe('data display', () => {
    test('shows site details and rooms', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await mockSiteDetail(page);
      await page.goto('/organization/sites/site-1');

      await expect(page.getByRole('heading', { name: 'Main Hall' })).toBeVisible();
      await expect(page.getByText('123 Main Street')).toBeVisible();
      await expect(page.getByText('The main event hall')).toBeVisible();

      // Rooms table
      await expect(page.getByRole('heading', { name: 'Rooms' })).toBeVisible();
      await expect(page.getByText('Conference Room A')).toBeVisible();
      await expect(page.getByText('Large conference room')).toBeVisible();
      await expect(page.getByText('Conference Room B')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees Edit button for site and Add button for rooms', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await mockSiteDetail(page);
      await page.goto('/organization/sites/site-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      // Room add button
      const roomsSection = page.getByRole('heading', { name: 'Rooms' }).locator('..');
      await expect(roomsSection.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('regular user sees no edit/add buttons', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await mockSiteDetail(page);
      await page.goto('/organization/sites/site-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      // Room add button should not be visible
      const roomsSection = page.getByRole('heading', { name: 'Rooms' }).locator('..');
      await expect(roomsSection.getByRole('button', { name: 'Add' })).toHaveCount(0);
      // Data still visible
      await expect(page.getByText('Main Hall').first()).toBeVisible();
      await expect(page.getByText('Conference Room A')).toBeVisible();
    });
  });

  test.describe('editing site', () => {
    test('admin can edit site and save calls PATCH endpoint', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });

      const updatedSite = { ...mockSite, name: 'Renamed Hall' };
      const captured: { url: string; method: string; body: unknown }[] = [];
      // Single route handling both GET and PATCH on the same URL
      await page.route(
        url =>
          url.pathname === `/api/v1/organizations/${ORG_ID}/sites/site-1` &&
          !url.searchParams.has('page'),
        async route => {
          if (route.request().method() === 'PATCH') {
            const body = JSON.parse(route.request().postData() ?? '{}');
            captured.push({ url: route.request().url(), method: 'PATCH', body });
            return route.fulfill({ json: updatedSite });
          }
          return route.fulfill({ json: mockSite });
        },
      );
      // Mock rooms list for the site
      await page.route(
        url =>
          url.pathname === `/api/v1/organizations/${ORG_ID}/sites/site-1/rooms` &&
          url.searchParams.has('page'),
        route =>
          route.fulfill({
            json: { items: mockRooms, total: mockRooms.length, page: 0, limit: 50 },
          }),
      );

      await page.goto('/organization/sites/site-1');

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit site' })).toBeVisible();

      const nameInput = page.getByRole('textbox').first();
      await nameInput.fill('Renamed Hall');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /sites/site-1 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Renamed Hall' });
    });
  });

  test.describe('creating a room', () => {
    test('admin can create a room and POST is called', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await mockSiteDetail(page);

      const newRoom = {
        id: 'room-new',
        name: 'New Room',
        description: 'A new room',
        siteId: 'site-1',
        organizationId: ORG_ID,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms`,
        'POST',
        newRoom,
      );

      await page.goto('/organization/sites/site-1');

      const roomsSection = page.getByRole('heading', { name: 'Rooms' }).locator('..');
      await roomsSection.getByRole('button', { name: 'Add' }).click();

      await expect(page.getByRole('heading', { name: 'New room' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Name' }).fill('New Room');
      await page.getByRole('textbox', { name: 'Description' }).fill('A new room');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST /sites/site-1/rooms was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'New Room', description: 'A new room' });
    });
  });

  test.describe('navigation', () => {
    test('clicking a room row navigates to room config', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await mockSiteDetail(page);
      await page.goto('/organization/sites/site-1');

      await page.getByText('Conference Room A').click();
      await expect(page).toHaveURL('/organization/sites/site-1/rooms/room-1');
    });

    test('back to sites button returns to sites list', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await mockSiteDetail(page);
      await page.goto('/organization/sites/site-1');

      await page.getByRole('button', { name: 'Back to sites' }).click();
      await expect(page).toHaveURL('/organization/sites');
    });
  });
});

// ---------------------------------------------------------------------------
// Room Config page
// ---------------------------------------------------------------------------

test.describe('Room Config page', () => {
  test.describe('data display', () => {
    test('shows room details', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await page.route(`**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms/room-1`, route =>
        route.fulfill({ json: mockRooms[0] }),
      );
      await page.goto('/organization/sites/site-1/rooms/room-1');

      await expect(page.getByRole('heading', { name: 'Conference Room A' })).toBeVisible();
      await expect(page.getByText('Large conference room')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees Edit button', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await page.route(`**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms/room-1`, route =>
        route.fulfill({ json: mockRooms[0] }),
      );
      await page.goto('/organization/sites/site-1/rooms/room-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
    });

    test('regular user does not see Edit button', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await page.route(`**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms/room-1`, route =>
        route.fulfill({ json: mockRooms[0] }),
      );
      await page.goto('/organization/sites/site-1/rooms/room-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    });
  });

  test.describe('editing', () => {
    test('admin can edit room and save calls PATCH endpoint', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });

      const updatedRoom = { ...mockRooms[0], name: 'Renamed Room' };
      const captured: { url: string; method: string; body: unknown }[] = [];
      // Single route handling both GET and PATCH on the same URL
      await page.route(
        `**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms/room-1`,
        async route => {
          if (route.request().method() === 'PATCH') {
            const body = JSON.parse(route.request().postData() ?? '{}');
            captured.push({ url: route.request().url(), method: 'PATCH', body });
            return route.fulfill({ json: updatedRoom });
          }
          return route.fulfill({ json: mockRooms[0] });
        },
      );

      await page.goto('/organization/sites/site-1/rooms/room-1');

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit room' })).toBeVisible();

      const nameInput = page.getByRole('textbox').first();
      await nameInput.fill('Renamed Room');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /rooms/room-1 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Renamed Room' });
    });
  });

  test.describe('navigation', () => {
    test('back to site button returns to site config', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { sites: mockSites, rooms: mockRooms });
      await page.route(`**/api/v1/organizations/${ORG_ID}/sites/site-1/rooms/room-1`, route =>
        route.fulfill({ json: mockRooms[0] }),
      );
      await page.goto('/organization/sites/site-1/rooms/room-1');

      await page.getByRole('button', { name: 'Back to site' }).click();
      await expect(page).toHaveURL('/organization/sites/site-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Organization Work Roles page
// ---------------------------------------------------------------------------

const mockWorkRoles = [
  {
    id: 1,
    name: 'Setup Crew',
    description: 'Sets up the venue',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Security',
    description: 'Handles security',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

test.describe('Organization Work Roles page', () => {
  test.describe('data display', () => {
    test('shows work roles in a table', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles });
      await page.goto('/organization/work-roles');

      await expect(page.getByRole('heading', { name: 'Work Roles' })).toBeVisible();
      await expect(page.getByText('Setup Crew').first()).toBeVisible();
      await expect(page.getByText('Sets up the venue')).toBeVisible();
      await expect(page.getByText('Security').first()).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees the Add button', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles });
      await page.goto('/organization/work-roles');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('user with work-role-management:write sees the Add button', async ({ page }) => {
      await mockCommonApis(page, userWithPermissions(['work-role-management:write']), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles });
      await page.goto('/organization/work-roles');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('regular user does not see the Add button', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles });
      await page.goto('/organization/work-roles');

      await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
    });
  });

  test.describe('creating a work role', () => {
    test('admin can create a work role and POST is called', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: [] });

      const newRole = {
        id: 3,
        name: 'Catering',
        description: 'Food service',
        organizationId: ORG_ID,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/work-roles`,
        'POST',
        newRole,
      );

      await page.goto('/organization/work-roles');
      await page.getByRole('button', { name: 'Add' }).click();

      await expect(page.getByRole('heading', { name: 'New work role' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Name' }).fill('Catering');
      await page.getByRole('textbox', { name: 'Description' }).fill('Food service');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect.poll(() => captured.length, { message: 'POST /work-roles was called' }).toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Catering', description: 'Food service' });
    });
  });

  test.describe('navigation', () => {
    test('clicking a work role row navigates to work role config', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles });
      await page.goto('/organization/work-roles');

      await page.getByText('Setup Crew').click();
      await expect(page).toHaveURL('/organization/work-roles/1');
    });
  });
});

// ---------------------------------------------------------------------------
// Work Role Config page
// ---------------------------------------------------------------------------

const mockWorkRoleDetail = {
  ...mockWorkRoles[0],
  requiredCertifications: [
    {
      id: 1,
      name: 'First Aid',
      description: 'Basic first aid',
      organizationId: ORG_ID,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  users: [
    {
      id: 10,
      userId: 'user-1',
      userName: 'Test User',
      userEmail: 'test@example.com',
      workRoleId: 1,
      workRoleName: 'Setup Crew',
      workRoleDescription: 'Sets up the venue',
      isQualified: true,
      notes: '',
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ],
};

const mockCerts = [
  {
    id: 1,
    name: 'First Aid',
    description: 'Basic first aid',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Forklift License',
    description: '',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

test.describe('Work Role Config page', () => {
  async function setupWorkRoleConfig(page: import('@playwright/test').Page, user = adminUser()) {
    await mockCommonApis(page, user, [testOrg]);
    await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles, certifications: mockCerts });
    await page.route(
      url => url.pathname === `/api/v1/organizations/${ORG_ID}/work-roles/1`,
      route => route.fulfill({ json: mockWorkRoleDetail }),
    );
  }

  test.describe('data display', () => {
    test('shows work role details, certifications, and assigned users', async ({ page }) => {
      await setupWorkRoleConfig(page);
      await page.goto('/organization/work-roles/1');

      await expect(page.getByRole('heading', { name: 'Setup Crew' })).toBeVisible();
      await expect(page.getByText('Sets up the venue')).toBeVisible();

      // Required certifications
      await expect(page.getByText('Required certifications')).toBeVisible();

      // Assigned users
      await expect(page.getByRole('heading', { name: 'Assigned people' })).toBeVisible();
      // "Test User" also appears in the NavBar
      await expect(page.getByText('Test User').nth(1)).toBeVisible();
      await expect(page.getByText('test@example.com')).toBeVisible();
      await expect(page.getByText('Qualified')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees Edit button and MultiSelect for certifications', async ({ page }) => {
      await setupWorkRoleConfig(page, adminUser());
      await page.goto('/organization/work-roles/1');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      // MultiSelect for certifications should be visible
      await expect(page.getByPlaceholder('Select certifications...')).toBeVisible();
    });

    test('regular user sees read-only certification badges', async ({ page }) => {
      await setupWorkRoleConfig(page, regularUser());
      await page.goto('/organization/work-roles/1');

      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      // Certifications shown as badges, not MultiSelect
      await expect(page.getByPlaceholder('Select certifications...')).toHaveCount(0);
      await expect(page.getByText('First Aid')).toBeVisible();
    });
  });

  test.describe('editing', () => {
    test('admin can edit work role and save calls PATCH endpoint', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: mockWorkRoles, certifications: mockCerts });

      const updatedRole = { ...mockWorkRoles[0], name: 'Setup Team' };
      const captured: { url: string; method: string; body: unknown }[] = [];
      // Single route handling both GET and PATCH on the same URL
      await page.route(
        url => url.pathname === `/api/v1/organizations/${ORG_ID}/work-roles/1`,
        async route => {
          if (route.request().method() === 'PATCH') {
            const body = JSON.parse(route.request().postData() ?? '{}');
            captured.push({ url: route.request().url(), method: 'PATCH', body });
            return route.fulfill({ json: updatedRole });
          }
          return route.fulfill({ json: mockWorkRoleDetail });
        },
      );

      await page.goto('/organization/work-roles/1');

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit work role' })).toBeVisible();

      const nameInput = page.getByRole('textbox').first();
      await nameInput.fill('Setup Team');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /work-roles/1 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Setup Team' });
    });
  });

  test.describe('certification linking', () => {
    test('adding a certification calls POST endpoint', async ({ page }) => {
      await setupWorkRoleConfig(page, adminUser());

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/work-roles/1/certifications`,
        'POST',
        {},
      );

      await page.goto('/organization/work-roles/1');

      // Select Forklift License in the MultiSelect
      await page.getByPlaceholder('Select certifications...').click();
      await page.getByRole('option', { name: 'Forklift License' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST work-roles/1/certifications was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ certificationId: 2 });
    });
  });

  test.describe('navigation', () => {
    test('back to list button returns to work roles list', async ({ page }) => {
      await setupWorkRoleConfig(page, adminUser());
      await page.goto('/organization/work-roles/1');

      await page.getByRole('button', { name: 'Back to work roles' }).click();
      await expect(page).toHaveURL('/organization/work-roles');
    });
  });
});

// ---------------------------------------------------------------------------
// Organization Users page
// ---------------------------------------------------------------------------

const mockOrgUsers = [
  {
    id: 'user-1',
    name: 'Alice Anderson',
    email: 'alice@example.com',
    description: '',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'user-2',
    name: 'Bob Brown',
    email: 'bob@example.com',
    description: '',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
    createdAt: '2025-01-02T00:00:00.000Z',
  },
];

test.describe('Organization Users page', () => {
  test.describe('data display', () => {
    test('shows organization users in a table', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { orgUsers: mockOrgUsers });
      await page.goto('/organization/users');

      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
      await expect(page.getByText('Alice Anderson')).toBeVisible();
      await expect(page.getByText('Bob Brown')).toBeVisible();
    });
  });

  test.describe('navigation', () => {
    test('clicking a user row navigates to org user profile', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { orgUsers: mockOrgUsers });
      await page.goto('/organization/users');

      await page.getByText('Alice Anderson').click();
      await expect(page).toHaveURL('/organization/users/user-1');
    });
  });
});

// ---------------------------------------------------------------------------
// Organization User Profile page
// ---------------------------------------------------------------------------

test.describe('Organization User Profile page', () => {
  async function setupOrgUserProfile(page: import('@playwright/test').Page, user = adminUser()) {
    await mockCommonApis(page, user, [testOrg]);
    await mockOrgApis(page, ORG_ID, {
      workRoles: mockWorkRoles,
      certifications: mockCerts,
    });
    // Mock the specific org user
    await page.route(
      url => url.pathname === `/api/v1/organizations/${ORG_ID}/users/user-2`,
      route => route.fulfill({ json: mockOrgUsers[1] }),
    );
    // Mock user's work roles
    await page.route(
      url => url.pathname === `/api/v1/organizations/${ORG_ID}/users/user-2/work-roles`,
      route =>
        route.fulfill({
          json: [
            {
              id: 30,
              userId: 'user-2',
              userName: 'Bob Brown',
              userEmail: 'bob@example.com',
              workRoleId: 1,
              workRoleName: 'Setup Crew',
              workRoleDescription: 'Sets up the venue',
              isQualified: false,
              notes: '',
              createdAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        }),
    );
    // Mock user's certifications
    await page.route(
      url => url.pathname === `/api/v1/organizations/${ORG_ID}/users/user-2/certifications`,
      route =>
        route.fulfill({
          json: [
            {
              id: 40,
              userId: 'user-2',
              certificationId: 1,
              certificationName: 'First Aid',
              certificationDescription: 'Basic first aid',
              certificationDate: '2025-03-01',
              validUntilDate: null,
              createdAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        }),
    );
  }

  test.describe('data display', () => {
    test('shows user details, work roles, and certifications', async ({ page }) => {
      await setupOrgUserProfile(page);
      await page.goto('/organization/users/user-2');

      await expect(page.getByRole('heading', { name: 'Bob Brown' })).toBeVisible();
      await expect(page.getByText('bob@example.com')).toBeVisible();

      // Work roles section
      await expect(page.getByRole('heading', { name: 'Work roles' })).toBeVisible();
      await expect(page.getByText('Setup Crew').first()).toBeVisible();

      // Certifications section
      await expect(page.getByRole('heading', { name: 'Certifications' })).toBeVisible();
      await expect(page.getByText('First Aid').first()).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees management controls for work roles and certifications', async ({ page }) => {
      await setupOrgUserProfile(page, adminUser());
      await page.goto('/organization/users/user-2');

      // Should see Select for adding roles
      await expect(page.getByPlaceholder('Select a role...')).toBeVisible();
      await expect(page.getByPlaceholder('Select a certification...')).toBeVisible();
      // Should see qualified toggle button
      await expect(page.getByRole('button', { name: 'Not qualified' })).toBeVisible();
    });

    test('regular user sees read-only view', async ({ page }) => {
      await setupOrgUserProfile(page, regularUser());
      await page.goto('/organization/users/user-2');

      // No management controls
      await expect(page.getByPlaceholder('Select a role...')).toHaveCount(0);
      await expect(page.getByPlaceholder('Select a certification...')).toHaveCount(0);
      // Data still visible
      await expect(page.getByRole('heading', { name: 'Bob Brown' })).toBeVisible();
      await expect(page.getByText('Setup Crew').first()).toBeVisible();
    });
  });

  test.describe('work role management', () => {
    test('admin can add a work role to user', async ({ page }) => {
      await setupOrgUserProfile(page, adminUser());

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/users/user-2/work-roles`,
        'POST',
        {
          id: 31,
          userId: 'user-2',
          userName: 'Bob Brown',
          userEmail: 'bob@example.com',
          workRoleId: 2,
          workRoleName: 'Security',
          workRoleDescription: 'Handles security',
          isQualified: false,
          notes: '',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.goto('/organization/users/user-2');

      await page.getByPlaceholder('Select a role...').click();
      await page.getByRole('option', { name: 'Security' }).click();
      await page.getByRole('button', { name: 'Add', exact: true }).click();

      await expect
        .poll(() => captured.length, { message: 'POST users/user-2/work-roles was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ workRoleId: 2 });
    });

    test('admin can toggle qualified status', async ({ page }) => {
      await setupOrgUserProfile(page, adminUser());

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/users/work-roles/30`,
        'PATCH',
        {
          id: 30,
          userId: 'user-2',
          userName: 'Bob Brown',
          userEmail: 'bob@example.com',
          workRoleId: 1,
          workRoleName: 'Setup Crew',
          workRoleDescription: 'Sets up the venue',
          isQualified: true,
          notes: '',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.goto('/organization/users/user-2');

      await page.getByRole('button', { name: 'Not qualified' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH users/work-roles/30 was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ isQualified: true });
    });

    test('admin can remove a work role from user', async ({ page }) => {
      await setupOrgUserProfile(page, adminUser());

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/users/work-roles/30`,
        'DELETE',
      );

      await page.goto('/organization/users/user-2');

      const roleRow = page.locator('text=Setup Crew').locator('..').locator('..');
      await roleRow.getByRole('button', { name: 'Delete' }).click();

      await expect
        .poll(() => captured.length, { message: 'DELETE users/work-roles/30 was called' })
        .toBe(1);
    });
  });

  test.describe('certification management', () => {
    test('admin can add a certification to user', async ({ page }) => {
      await setupOrgUserProfile(page, adminUser());

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/users/user-2/certifications`,
        'POST',
        {
          id: 41,
          userId: 'user-2',
          certificationId: 2,
          certificationName: 'Forklift License',
          certificationDescription: '',
          certificationDate: '2025-06-01',
          validUntilDate: null,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.goto('/organization/users/user-2');

      await page.getByPlaceholder('Select a certification...').click();
      await page.getByRole('option', { name: 'Forklift License' }).click();

      // Set date
      await page.getByLabel('Certification date').fill('2025-06-01');

      await page.getByRole('button', { name: 'Add certification' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST users/user-2/certifications was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({
        certificationId: 2,
        certificationDate: '2025-06-01',
      });
    });
  });

  test.describe('navigation', () => {
    test('back to list button returns to org users', async ({ page }) => {
      await setupOrgUserProfile(page, adminUser());
      await page.goto('/organization/users/user-2');

      await page.getByRole('button', { name: 'Back to users' }).click();
      await expect(page).toHaveURL('/organization/users');
    });
  });
});
