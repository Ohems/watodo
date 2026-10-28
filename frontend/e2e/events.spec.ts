import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  interceptMutation,
  mockCommonApis,
  mockEventSeriesManagement,
  mockOrgApis,
  ORG_ID,
  regularUser,
  userWithPermissions,
} from './helpers.js';

const testOrg = createOrganization();

const mockSites = [
  {
    id: 'site-1',
    name: 'Main Hall',
    description: null,
    address: null,
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockRooms = [
  {
    id: 'room-1',
    name: 'Conference Room A',
    description: '',
    siteId: 'site-1',
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
    memberCount: 3,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockEventSeries = [
  {
    id: 1,
    title: 'Summer Festival',
    description: 'Annual summer event',
    calendarId: 'cal-1',
    siteId: 'site-1',
    roomId: 'room-1',
    reserveWholeSite: false,
    start: '2025-07-15T10:00:00.000Z',
    durationMinutes: 480,
    isAllDay: false,
    timezone: 'UTC',
    isVisible: true,
    rrule: null,
    recurrence: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    organizationId: ORG_ID,
    organizationName: 'Test Org',
    siteName: 'Main Hall',
    roomName: 'Conference Room A',
    teams: [{ id: 'team-1', name: 'Setup Team' }],
  },
  {
    id: 2,
    title: 'Winter Market',
    description: null,
    calendarId: 'cal-1',
    siteId: null,
    roomId: null,
    reserveWholeSite: false,
    start: '2025-12-01T08:00:00.000Z',
    durationMinutes: 600,
    isAllDay: true,
    timezone: 'UTC',
    isVisible: true,
    rrule: null,
    recurrence: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    organizationId: ORG_ID,
    organizationName: 'Test Org',
    siteName: null,
    roomName: null,
    teams: [],
  },
];

test.describe('Event Management page', () => {
  async function setupEventManagement(
    page: import('@playwright/test').Page,
    user = adminUser(),
    items = mockEventSeries,
  ) {
    await mockCommonApis(page, user, [testOrg]);
    await mockOrgApis(page, ORG_ID, {
      sites: mockSites,
      rooms: mockRooms,
      teams: mockTeams,
    });
    await mockEventSeriesManagement(page, items);
  }

  test.describe('data display', () => {
    test('shows event series in a table', async ({ page }) => {
      await setupEventManagement(page);
      await page.goto('/events/management');

      await expect(page.getByRole('heading', { name: 'Management' })).toBeVisible();
      await expect(page.getByText('Summer Festival')).toBeVisible();
      await expect(page.getByText('Winter Market')).toBeVisible();

      // Location info
      await expect(page.getByText('Main Hall - Conference Room A')).toBeVisible();
      await expect(page.getByText('No location')).toBeVisible();

      // Team badges (use first() because the team name also appears in the filter dropdown)
      await expect(page.getByText('Setup Team').first()).toBeVisible();
      await expect(page.getByText('No teams assigned')).toBeVisible();
    });

    test('shows empty state when no events', async ({ page }) => {
      await setupEventManagement(page, adminUser(), []);
      await page.goto('/events/management');

      await expect(page.getByText('No results found')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees the Add button', async ({ page }) => {
      await setupEventManagement(page, adminUser());
      await page.goto('/events/management');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('user with events:write sees the Add button', async ({ page }) => {
      await setupEventManagement(page, userWithPermissions(['events:write']));
      await page.goto('/events/management');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('regular user does not see the Add button', async ({ page }) => {
      await setupEventManagement(page, regularUser());
      await page.goto('/events/management');

      await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
      await expect(page.getByText('Summer Festival')).toBeVisible();
    });
  });

  test.describe('navigation', () => {
    test('clicking an event row navigates to event config', async ({ page }) => {
      await setupEventManagement(page);
      await page.goto('/events/management');

      await page.getByText('Summer Festival').click();
      await expect(page).toHaveURL('/events/1');
    });

    test('Add button navigates to new event page', async ({ page }) => {
      await setupEventManagement(page, adminUser());
      await page.goto('/events/management');

      await page.getByRole('button', { name: 'Add' }).click();
      await expect(page).toHaveURL('/events/new');
    });
  });
});

test.describe('Event Config page', () => {
  const mockSeriesDetail = mockEventSeries[0];

  async function setupEventConfig(
    page: import('@playwright/test').Page,
    user = adminUser(),
    seriesId = 1,
  ) {
    await mockCommonApis(page, user, [testOrg]);
    await mockOrgApis(page, ORG_ID, {
      sites: mockSites,
      rooms: mockRooms,
      teams: mockTeams,
    });
    await page.route(
      url => url.pathname === `/api/v1/event-series/${seriesId}/management`,
      route => route.fulfill({ json: mockSeriesDetail }),
    );
  }

  test.describe('data display', () => {
    test('shows event details', async ({ page }) => {
      await setupEventConfig(page);
      await page.goto('/events/1');

      await expect(page.getByRole('heading', { name: 'Summer Festival' })).toBeVisible();
      // "Test Org" appears in both the org selector and page content
      await expect(page.getByText('Test Org').first()).toBeVisible();
      await expect(page.getByText('480')).toBeVisible();
      // Site shown in the site combobox (value, not text, since it's inside a closed dropdown)
      await expect(page.getByRole('combobox', { name: 'No site' })).toHaveValue('Main Hall');
    });

    test('shows invalid event ID error', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await page.goto('/events/abc');

      await expect(page.getByText('Invalid event ID')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees Save button and editable selects', async ({ page }) => {
      await setupEventConfig(page, adminUser());
      await page.goto('/events/1');

      await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
      // Site select is editable (a combobox)
      await expect(page.getByRole('combobox').first()).toBeVisible();
    });

    test('regular user sees read-only view with no Save button', async ({ page }) => {
      await setupEventConfig(page, regularUser());
      await page.goto('/events/1');

      await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
      // Data still visible as text (title appears in both heading and paragraph)
      await expect(page.getByRole('heading', { name: 'Summer Festival' })).toBeVisible();
      // Regular user sees site as text (not a combobox)
      await expect(page.getByText('Main Hall')).toBeVisible();
      // Team shown as badge
      await expect(page.getByText('Setup Team').first()).toBeVisible();
    });
  });

  test.describe('editing', () => {
    test('admin can save event config and PATCH is called', async ({ page }) => {
      await setupEventConfig(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-series/1/config',
        'PATCH',
        mockSeriesDetail,
      );

      await page.goto('/events/1');

      // Change the site selection
      await page.getByRole('combobox').first().click();
      // Select "Main Hall" (already selected, but click to ensure dropdown works)
      // Actually, let's just click Save to test the endpoint is called
      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /event-series/1/config was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({
        siteId: 'site-1',
        roomId: 'room-1',
      });
    });
  });

  test.describe('navigation', () => {
    test('back to list button returns to management', async ({ page }) => {
      await setupEventConfig(page, adminUser());
      await page.goto('/events/1');

      await page.getByRole('button', { name: 'Back to events' }).click();
      await expect(page).toHaveURL('/events/management');
    });
  });
});
