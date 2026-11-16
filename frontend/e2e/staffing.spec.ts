import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  gotoApp,
  interceptMutation,
  mockCommonApis,
  mockOccurrences,
  mockOrgApis,
  ORG_ID,
  regularUser,
  waitForAppReady,
} from './helpers.js';

const testOrg = createOrganization();

const mockWorkRole = {
  id: 3,
  name: 'Kitchen Helper',
  description: 'Help prepare and serve food.',
  organizationId: ORG_ID,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

// Occurrence 1: one filled slot, one unfilled critical slot, one filled info slot.
const mockOccurrence1 = {
  occurrenceId: null,
  seriesId: 1,
  title: 'Summer Festival',
  description: 'Annual summer event',
  isAllDay: false,
  siteId: null,
  roomId: null,
  reserveWholeSite: false,
  organizationId: ORG_ID,
  organizationName: 'Test Org',
  occurrenceStart: '2025-07-15T10:00:00.000Z',
  start: '2025-07-15T10:00:00.000Z',
  end: '2025-07-15T18:00:00.000Z',
  isRescheduled: false,
  isCancelled: false,
  exceptionId: null,
  isParticipant: false,
  isManager: false,
  workRoleSlots: [
    {
      slotId: 5,
      title: 'Kitchen Helper',
      workRoleId: 3,
      workRoleName: 'Kitchen Helper',
      isCritical: false,
      assigneeCount: 1,
    },
    {
      slotId: 6,
      title: 'Setup',
      workRoleId: null,
      workRoleName: null,
      isCritical: true,
      assigneeCount: 0,
    },
  ],
  managedUnfilledCriticalSlots: [],
  infoSlotCount: 2,
  filledInfoSlotCount: 1,
};

// Occurrence 2: fully staffed, no info slots.
const mockOccurrence2 = {
  ...mockOccurrence1,
  occurrenceId: 9,
  seriesId: 2,
  title: 'Winter Market',
  occurrenceStart: '2025-12-01T08:00:00.000Z',
  start: '2025-12-01T08:00:00.000Z',
  end: '2025-12-01T16:00:00.000Z',
  workRoleSlots: [
    {
      slotId: 7,
      title: 'Cook',
      workRoleId: null,
      workRoleName: null,
      isCritical: false,
      assigneeCount: 2,
    },
  ],
  infoSlotCount: 0,
  filledInfoSlotCount: 0,
};

// Detail of occurrence 1 (tmp ref) for the expanded staffing panel.
const mockDetail1 = {
  series: {
    id: 1,
    title: 'Summer Festival',
    description: 'Annual summer event',
    calendarId: 'cal-1',
    siteId: null,
    roomId: null,
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
  },
  occurrence: {
    occurrenceId: null,
    seriesId: 1,
    title: 'Summer Festival',
    description: 'Annual summer event',
    isAllDay: false,
    siteId: null,
    roomId: null,
    reserveWholeSite: false,
    organizationId: ORG_ID,
    organizationName: 'Test Org',
    occurrenceStart: '2025-07-15T10:00:00.000Z',
    start: '2025-07-15T10:00:00.000Z',
    end: '2025-07-15T18:00:00.000Z',
    isRescheduled: false,
    isCancelled: false,
    exceptionId: null,
    isParticipant: false,
    isManager: false,
    workRoleSlots: [],
    managedUnfilledCriticalSlots: [],
    infoSlotCount: 2,
    filledInfoSlotCount: 1,
  },
  workRoles: [],
  parentWorkRoles: [
    {
      id: 5,
      seriesId: 1,
      occurrenceId: null,
      inheritedFromWorkRoleId: null,
      title: 'Kitchen Helper',
      description: 'Help prepare and serve food.',
      isCritical: false,
      workRoleId: 3,
      workRoleName: 'Kitchen Helper',
      assignments: [
        {
          id: 11,
          eventWorkRoleId: 5,
          userId: 'user-2',
          userName: 'Second User',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      ],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 6,
      seriesId: 1,
      occurrenceId: null,
      inheritedFromWorkRoleId: null,
      title: 'Setup',
      description: '',
      isCritical: true,
      workRoleId: null,
      workRoleName: null,
      assignments: [],
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  occurrenceWorkRoles: [],
  missingParentWorkRoles: [],
  infoSlots: [
    {
      id: 20,
      seriesId: 1,
      occurrenceId: null,
      inheritedFromInfoSlotId: null,
      title: 'Sermon topic',
      description: 'Text of the sermon.',
      value: 'The Good Samaritan',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 21,
      seriesId: 1,
      occurrenceId: null,
      inheritedFromInfoSlotId: null,
      title: 'Special notes',
      description: '',
      value: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  parentInfoSlots: [],
  occurrenceInfoSlots: [],
  missingParentInfoSlots: [],
  comments: [],
  readiness: { roles: [], isReady: true, unfilledCriticalCount: 0 },
};

const mockCandidates = [
  {
    id: 'user-1',
    name: 'Test User',
    hasAbsence: false,
    hasWorkRole: true,
    isQualified: true,
    missingCertifications: [],
    assignmentCount: 2,
    workloadHours: 4,
  },
  {
    id: 'user-3',
    name: 'Third User',
    hasAbsence: false,
    hasWorkRole: false,
    isQualified: false,
    missingCertifications: [],
    assignmentCount: 0,
    workloadHours: 0,
  },
];

const mockWorkload = {
  items: [
    {
      userId: 'user-3',
      name: 'Third User',
      assignmentCount: 0,
      hours: 0,
      criticalAssignmentCount: 0,
      hasAbsence: false,
      // 12 week columns force the table wider than the card (horizontal scroll).
      weeks: Array.from({ length: 12 }, (_, i) => ({
        start: new Date(Date.UTC(2025, 6, 14 + i * 7)).toISOString(),
        count: 0,
        hours: 0,
      })),
    },
    {
      userId: 'user-1',
      name: 'Test User',
      assignmentCount: 2,
      hours: 4,
      criticalAssignmentCount: 1,
      hasAbsence: false,
      weeks: Array.from({ length: 12 }, (_, i) => ({
        start: new Date(Date.UTC(2025, 6, 14 + i * 7)).toISOString(),
        count: i === 0 ? 2 : 0,
        hours: i === 0 ? 4 : 0,
      })),
    },
  ],
};

async function setupStaffingPage(page: import('@playwright/test').Page, user = adminUser()) {
  await mockCommonApis(page, user, [testOrg]);
  await mockOrgApis(page, ORG_ID, { workRoles: [mockWorkRole] });
  await mockOccurrences(page, [mockOccurrence1, mockOccurrence2]);
  await page.route(
    url =>
      url.pathname.includes('/api/v1/organizations/') &&
      url.pathname.endsWith('/staffing/workload'),
    route => route.fulfill({ json: mockWorkload }),
  );
  await page.route(
    url => url.pathname.includes('/api/v1/event-occurrences/tmp'),
    route => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith('/materialize')) {
        return route.fulfill({ json: { occurrenceId: 9, conflicts: [] } });
      }
      return route.fulfill({ json: mockDetail1 });
    },
  );
  await page.route(
    url =>
      url.pathname.startsWith('/api/v1/event-series/1/work-roles/') &&
      url.pathname.endsWith('/assignment-candidates'),
    route => route.fulfill({ json: mockCandidates }),
  );
  await gotoApp(page, '/events/staffing');
  await waitForAppReady(page);
}

test.describe('Staffing page', () => {
  test.describe('data display', () => {
    test('shows upcoming occurrences with fill badges and info slot hint', async ({ page }) => {
      await setupStaffingPage(page);

      await expect(page.getByRole('heading', { name: 'Staffing' })).toBeVisible();
      await expect(page.getByText('Summer Festival')).toBeVisible();
      await expect(page.getByText('Winter Market')).toBeVisible();
      // 1/2 filled and 1 critical unfilled on the first occurrence.
      await expect(page.getByText('1/2 filled')).toBeVisible();
      await expect(page.getByText('1 critical unfilled')).toBeVisible();
      await expect(page.getByText('1/2 info slots filled')).toBeVisible();
    });

    test('event cards do not show the accordion item border-bottom separator', async ({ page }) => {
      await setupStaffingPage(page);

      // Each event card wraps a single-item accordion; the item must not draw
      // its own border-bottom line (the card already has a full border).
      const item = page.locator('.mantine-Accordion-item').first();
      await expect(item).toBeVisible();
      await expect(item).toHaveCSS('border-bottom-width', '0px');
    });

    test('expanding an occurrence shows its slots, assignees and info slots', async ({ page }) => {
      await setupStaffingPage(page);

      await page.getByText('Summer Festival').click();
      await expect(page.getByText('Kitchen Helper').first()).toBeVisible();
      await expect(page.getByText('Second User', { exact: true })).toBeVisible();
      await expect(page.getByText('Setup')).toBeVisible();
      // Info slots are shown read-only in the expanded row.
      await expect(page.getByText('Sermon topic')).toBeVisible();
      await expect(page.getByText('The Good Samaritan')).toBeVisible();
    });

    test('unfilled view lists only empty slots, critical first', async ({ page }) => {
      await setupStaffingPage(page);

      await page.getByText('Unfilled slots', { exact: true }).click();
      await expect(page.getByText('Setup')).toBeVisible();
      await expect(page.getByText('Kitchen Helper')).toHaveCount(0);
      await expect(page.getByText('Critical', { exact: true })).toBeVisible();
    });

    test('workload view shows the per-user matrix with week-number columns, sorted by assignment count', async ({
      page,
    }) => {
      await setupStaffingPage(page);

      await page.getByText('Workload', { exact: true }).click();
      const table = page.getByRole('table');
      await expect(table.getByText('Third User')).toBeVisible();
      await expect(table.getByText('Test User')).toBeVisible();
      // Columns: Person, Total, then week-number columns (ISO week of the bucket).
      const headerCells = table.getByRole('row').first().getByRole('columnheader');
      await expect(headerCells.nth(0)).toHaveText('Person');
      await expect(headerCells.nth(1)).toHaveText('Total');
      await expect(headerCells.nth(2)).toHaveText('W29');
      // With 12 week columns the table is wider than its scroll container.
      const scrollContainer = table.locator('xpath=ancestor::div[contains(@style,"overflow-x")]');
      await expect
        .poll(async () => {
          const el = await scrollContainer.elementHandle();
          return el ? await el.evaluate(n => n.scrollWidth > n.clientWidth) : false;
        })
        .toBe(true);
      // Least-loaded first: Third User (0) before Test User (2).
      const rows = table.getByRole('row');
      await expect(rows.nth(1)).toContainText('Third User');
      await expect(rows.nth(2)).toContainText('Test User');
    });

    test('person names are links to the user profile', async ({ page }) => {
      await setupStaffingPage(page);

      await page.getByText('Workload', { exact: true }).click();
      await page.getByRole('link', { name: 'Third User' }).click();
      await expect(page).toHaveURL('/organization/users/user-3');
    });

    test('clearing a date filter does not crash and keeps the data visible', async ({ page }) => {
      await setupStaffingPage(page);

      await expect(page.getByText('Summer Festival')).toBeVisible();
      // Clear the "From" date via its clear button (DatePickerInput clearable).
      await page.locator('.mantine-InputClearButton-root').first().click();
      // The page must still render the occurrences (no Invalid Date crash).
      await expect(page.getByText('Summer Festival')).toBeVisible();
      await expect(page.getByText('Winter Market')).toBeVisible();
    });

    test('available view lists users with zero assignments in range', async ({ page }) => {
      await setupStaffingPage(page);

      await page.getByText('Available', { exact: true }).click();
      const table = page.getByRole('table');
      await expect(page.getByText('1 available')).toBeVisible();
      await expect(table.getByText('Third User')).toBeVisible();
      await expect(table.getByText('Test User')).toHaveCount(0);
    });
  });

  test.describe('filter persistence', () => {
    test('view and toggle filters are stored in localStorage and restored after reload', async ({
      page,
    }) => {
      await setupStaffingPage(page);

      // Toggle the "Unfilled only" switch and switch to the unfilled view
      // (click the visible segment label; the radio input itself is hidden).
      const segments = page.getByRole('radiogroup');
      await page.getByRole('switch', { name: 'Unfilled only' }).click();
      await segments.getByText('Unfilled slots', { exact: true }).click();
      await expect(page.getByRole('columnheader', { name: 'Slot' })).toBeVisible();
      await expect(page.getByText('Setup')).toBeVisible();

      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForAppReady(page);

      // The unfilled view is still active after the reload.
      await expect(page.getByRole('columnheader', { name: 'Slot' })).toBeVisible();
      await expect(page.getByText('Setup')).toBeVisible();

      // The filters are stored in localStorage, scoped to the organization.
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem('watodo_staffing_filters') ?? '{}'),
      );
      expect(stored[ORG_ID].view).toBe('unfilled');
      expect(stored[ORG_ID].unfilledOnly).toBe(true);

      // Switching back to the events view keeps the persisted toggle.
      await segments.getByText('Events', { exact: true }).click();
      await expect(page.getByRole('switch', { name: 'Unfilled only' })).toBeChecked();
    });
  });

  test.describe('permission levels', () => {
    test('regular user sees the staffing data read-only without assign controls', async ({
      page,
    }) => {
      await setupStaffingPage(page, regularUser());

      await page.getByText('Summer Festival').click();
      await expect(page.getByText('Second User', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Assign', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'All in range' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Remove Second User from this slot' }),
      ).toHaveCount(0);
    });
  });

  test.describe('editing', () => {
    test('assigning a user in the expanded row materializes the tmp occurrence and POSTs the assignment', async ({
      page,
    }) => {
      await setupStaffingPage(page, adminUser());

      const materializeCaptured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/tmp*/materialize',
        'POST',
        { occurrenceId: 9, conflicts: [] },
      );
      const assignCaptured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/work-roles/6/assignments',
        'POST',
        {
          id: 12,
          eventWorkRoleId: 6,
          userId: 'user-3',
          userName: 'Third User',
          createdAt: '2025-01-02T00:00:00.000Z',
        },
      );

      await page.getByText('Summer Festival').click();
      // Open the assign modal of the unfilled "Setup" slot (second slot).
      await page.getByRole('button', { name: 'Assign', exact: true }).nth(1).click();
      const dialog = page.getByRole('dialog');
      // The modal's cancel button is capitalized like everywhere else.
      expect(await dialog.getByRole('button', { name: 'Cancel', exact: true }).textContent()).toBe(
        'Cancel',
      );
      await dialog.locator('input[placeholder="Select user"]').click();
      // Role declarers first (Test User declared the role), each option shows
      // its assignment count in range as a badge; Third User has 0.
      const options = page.getByRole('option');
      await expect(options.nth(0)).toContainText('Test User');
      await expect(options.nth(0)).toContainText('2');
      await expect(options.nth(1)).toContainText('Third User');
      await options.nth(1).click();
      await dialog.getByRole('button', { name: 'Assign', exact: true }).click();

      await expect
        .poll(() => materializeCaptured.length, { message: 'materialize was called' })
        .toBe(1);
      await expect
        .poll(() => assignCaptured.length, { message: 'POST assignment was called' })
        .toBe(1);
      expect(assignCaptured[0].method).toBe('POST');
      expect(assignCaptured[0].body).toEqual({ userId: 'user-3' });
    });

    test('bulk assign POSTs all occurrence starts of the series in range', async ({ page }) => {
      await setupStaffingPage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-series/1/work-roles/6/assignments/bulk',
        'POST',
        { results: [] },
      );

      await page.getByText('Summer Festival').click();
      await page.getByRole('button', { name: 'Assign', exact: true }).nth(1).click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input[placeholder="Select user"]').click();
      await page.getByRole('option', { name: /Third User/ }).click();
      await dialog
        .getByRole('button', { name: 'Assign to all occurrences of this series in range' })
        .click();

      await expect.poll(() => captured.length, { message: 'bulk assign was called' }).toBe(1);
      expect(captured[0].method).toBe('POST');
      expect(captured[0].body).toMatchObject({
        userId: 'user-3',
        occurrenceStarts: ['2025-07-15T10:00:00.000Z'],
      });
    });
  });
});
