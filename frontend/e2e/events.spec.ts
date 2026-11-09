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

    test('shows a booking conflict warning when the saved config overlaps another booking', async ({
      page,
    }) => {
      await setupEventConfig(page, adminUser());

      const withConflicts = {
        ...mockSeriesDetail,
        conflicts: [
          {
            seriesId: 2,
            title: 'Winter Market',
            occurrenceStart: '2025-12-01T08:00:00.000Z',
            start: '2025-07-15T10:30:00.000Z',
            end: '2025-07-15T11:30:00.000Z',
            siteId: 'site-1',
            roomId: 'room-1',
            reserveWholeSite: false,
          },
        ],
      };
      await interceptMutation(page, '**/api/v1/event-series/1/config', 'PATCH', withConflicts);

      await page.goto('/events/1');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('Booking conflicts')).toBeVisible();
      await expect(page.getByText(/Winter Market/)).toBeVisible();
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

test.describe('New event page', () => {
  const mockCalendars = [
    {
      id: 'cal-1',
      name: 'Main Calendar',
      organizationId: ORG_ID,
      defaultTimezone: 'UTC',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  async function setupNewEvent(page: import('@playwright/test').Page, user = adminUser()) {
    await mockCommonApis(page, user, [testOrg]);
    await page.route(
      url =>
        url.pathname === '/api/v1/calendars' && url.searchParams.get('organizationId') === ORG_ID,
      route => route.fulfill({ json: mockCalendars }),
    );
  }

  test.describe('data display', () => {
    test('shows the new event series dialog', async ({ page }) => {
      await setupNewEvent(page);
      await page.goto('/events/new');

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('New event series')).toBeVisible();
      await expect(dialog.getByRole('textbox', { name: 'Title' })).toBeVisible();
      // The first calendar of the active organization is preselected (combobox value is hidden text)
      await expect(dialog.getByRole('combobox', { name: 'Calendar' })).toHaveValue('Main Calendar');
    });
  });

  test.describe('permission-based UI', () => {
    test('user with events:write sees the Save button', async ({ page }) => {
      await setupNewEvent(page, userWithPermissions(['events:write']));
      await page.goto('/events/new');

      await expect(page.getByRole('dialog').getByRole('button', { name: 'Save' })).toBeVisible();
    });

    test('regular user gets an insufficient-rights error when saving', async ({ page }) => {
      await setupNewEvent(page, regularUser());
      await page.route('**/api/v1/event-series', route => {
        if (route.request().method() === 'POST') {
          return route.fulfill({ status: 403, json: { error: 'Insufficient rights!' } });
        }
        return route.continue();
      });
      await page.goto('/events/new');

      // Wait until the calendars have loaded and the default is selected
      await expect(page.getByRole('combobox', { name: 'Calendar' })).toHaveValue('Main Calendar');
      await page.getByRole('textbox', { name: 'Title' }).fill('Created Event');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect(page.getByText('Insufficient rights!')).toBeVisible();
    });
  });

  test.describe('editing', () => {
    test('saving creates the event series via POST and returns to management', async ({ page }) => {
      await setupNewEvent(page, adminUser());
      const captured = await interceptMutation(page, '**/api/v1/event-series', 'POST', {
        ...mockEventSeries[0],
        id: 3,
        title: 'Created Event',
      });
      await page.goto('/events/new');

      // Wait until the calendars have loaded and the default is selected
      await expect(page.getByRole('combobox', { name: 'Calendar' })).toHaveValue('Main Calendar');
      await page.getByRole('textbox', { name: 'Title' }).fill('Created Event');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST /event-series was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ title: 'Created Event', calendarId: 'cal-1' });
      await expect(page).toHaveURL('/events/management');
    });

    test('empty title shows a field error below the input and does not POST', async ({ page }) => {
      await setupNewEvent(page, adminUser());
      const captured = await interceptMutation(page, '**/api/v1/event-series', 'POST', {});
      await page.goto('/events/new');

      await expect(page.getByRole('combobox', { name: 'Calendar' })).toHaveValue('Main Calendar');
      await page.getByRole('button', { name: 'Save' }).click();

      const titleInput = page.getByRole('textbox', { name: 'Title' });
      await expect(page.getByText('Title is required')).toBeVisible();
      await expect(titleInput).toHaveAttribute('aria-invalid', 'true');
      expect(captured).toHaveLength(0);
    });

    test('shows a booking conflict warning and keeps the dialog open when the created series overlaps another booking', async ({
      page,
    }) => {
      await setupNewEvent(page, adminUser());
      const withConflicts = {
        ...mockEventSeries[0],
        id: 3,
        title: 'Created Event',
        conflicts: [
          {
            seriesId: 1,
            title: 'Summer Festival',
            occurrenceStart: '2025-07-15T10:00:00.000Z',
            start: '2025-07-15T10:00:00.000Z',
            end: '2025-07-15T18:00:00.000Z',
            siteId: 'site-1',
            roomId: 'room-1',
            reserveWholeSite: false,
          },
        ],
      };
      const captured = await interceptMutation(
        page,
        '**/api/v1/event-series',
        'POST',
        withConflicts,
      );
      await page.goto('/events/new');

      await expect(page.getByRole('combobox', { name: 'Calendar' })).toHaveValue('Main Calendar');
      await page.getByRole('textbox', { name: 'Title' }).fill('Created Event');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST /event-series was called' })
        .toBe(1);
      // The save succeeded, but the dialog stays open and flags the conflict.
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Booking conflicts')).toBeVisible();
      await expect(dialog.getByText(/Summer Festival/)).toBeVisible();
      await expect(page).toHaveURL('/events/new');
    });
  });
});
