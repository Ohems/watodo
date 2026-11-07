import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  interceptMutation,
  mockCommonApis,
  mockOrgApis,
  mockUserList,
  ORG_ID,
  regularUser,
  userWithPermissions,
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

const mockSlot = {
  id: 5,
  seriesId: 1,
  occurrenceId: 9,
  inheritedFromWorkRoleId: 3,
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
};

const mockCriticalSlot = {
  id: 6,
  seriesId: 1,
  occurrenceId: 9,
  inheritedFromWorkRoleId: null,
  title: 'Setup',
  description: '',
  isCritical: true,
  workRoleId: null,
  workRoleName: null,
  assignments: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockDetail = {
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
    occurrenceId: 9,
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
  },
  workRoles: [mockSlot, mockCriticalSlot],
  parentWorkRoles: [],
  occurrenceWorkRoles: [mockSlot, mockCriticalSlot],
  missingParentWorkRoles: [],
  comments: [],
  readiness: {
    roles: [
      {
        workRoleId: 3,
        workRoleName: 'Kitchen Helper',
        required: 1,
        filled: 1,
        isCritical: false,
        isUnfilled: false,
      },
    ],
    isReady: true,
    unfilledCriticalCount: 0,
  },
};

async function setupOccurrencePage(
  page: import('@playwright/test').Page,
  user = adminUser(),
): Promise<void> {
  await mockCommonApis(page, user, [testOrg]);
  await mockOrgApis(page, ORG_ID, { workRoles: [mockWorkRole] });
  await mockUserList(page, [
    { id: 'user-1', name: 'Test User' },
    { id: 'user-2', name: 'Second User' },
  ]);
  await page.route(
    url => url.pathname === '/api/v1/event-occurrences/9' && url.search === '',
    route => route.fulfill({ json: mockDetail }),
  );
  await page.goto('/events/occurrences/9');
  await waitForAppReady(page);
}

test.describe('Event occurrence page', () => {
  test.describe('data display', () => {
    test('shows the occurrence with its work role slots, description and assignees', async ({
      page,
    }) => {
      await setupOccurrencePage(page);

      await expect(page.getByRole('heading', { name: /Summer Festival/ }).first()).toBeVisible();
      // Slot title (work role name), its description and the assignee badge.
      await expect(page.getByText('Kitchen Helper').first()).toBeVisible();
      await expect(page.getByText('Help prepare and serve food.')).toBeVisible();
      // The assignee gets a dedicated row with a larger font (md = 16px),
      // rendered as a row of a headerless table (no column headers).
      const assigneeName = page.getByText('Second User', { exact: true }).first();
      await expect(assigneeName).toBeVisible();
      await expect(assigneeName).toHaveCSS('font-size', '16px');
      await expect(page.getByRole('row')).toHaveCount(1);
      await expect(page.getByRole('columnheader')).toHaveCount(0);
      // Tags: the critical slot shows the CRITICAL tag plus UNFILLED, the
      // filled optional slot shows FILLED (criticality is not repeated).
      await expect(page.getByText('Critical', { exact: true })).toBeVisible();
      await expect(page.getByText('Unfilled', { exact: true })).toBeVisible();
      await expect(page.getByText('Filled', { exact: true })).toBeVisible();
      // Readiness card: all roles filled.
      await expect(page.getByText('Ready')).toBeVisible();
    });
  });

  test.describe('permission levels', () => {
    test('admin sees the required toggle, description edit, delete and add controls', async ({
      page,
    }) => {
      await setupOccurrencePage(page, adminUser());

      // Two slot toggles plus the one in the add-slot form.
      await expect(page.getByRole('switch', { name: 'Critical role' })).toHaveCount(3);
      await expect(
        page.getByRole('button', { name: 'Remove Second User from this slot' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Edit description' }).first()).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Delete work role slot' }).first(),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add work role slot' })).toBeVisible();
    });

    test('user with events:write sees the write controls', async ({ page }) => {
      await setupOccurrencePage(page, userWithPermissions(['events:write']));

      await expect(page.getByRole('switch', { name: 'Critical role' })).toHaveCount(3);
      await expect(page.getByRole('button', { name: 'Add work role slot' })).toBeVisible();
    });

    test('regular user sees the slots read-only without write controls', async ({ page }) => {
      await setupOccurrencePage(page, regularUser());

      // Data is still visible, including the CRITICAL tag on the critical
      // slot (criticality must be visible without the toggle).
      await expect(page.getByText('Kitchen Helper').first()).toBeVisible();
      await expect(page.getByText('Help prepare and serve food.')).toBeVisible();
      await expect(page.getByText('Critical', { exact: true })).toBeVisible();
      await expect(page.getByText('Unfilled', { exact: true })).toBeVisible();
      // But no write controls.
      await expect(page.getByRole('switch', { name: 'Critical role' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Remove Second User from this slot' }),
      ).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Edit description' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Delete work role slot' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add work role slot' })).toHaveCount(0);
    });
  });

  test.describe('editing', () => {
    test('toggling the required switch PATCHes isCritical on the occurrence slot', async ({
      page,
    }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/work-roles/5',
        'PATCH',
        { ...mockSlot, isCritical: true },
      );

      // The first slot (id 5) is the optional one.
      await page.getByRole('switch', { name: 'Critical role' }).first().click();

      await expect
        .poll(() => captured.length, { message: 'PATCH occurrence work role slot was called' })
        .toBe(1);
      expect(captured[0].method).toBe('PATCH');
      expect(captured[0].body).toEqual({ isCritical: true });
    });

    test('removing an assignee DELETEs the assignment', async ({ page }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/work-roles/5/assignments/11',
        'DELETE',
        { success: true },
      );

      await page.getByRole('button', { name: 'Remove Second User from this slot' }).click();

      await expect.poll(() => captured.length, { message: 'DELETE assignment was called' }).toBe(1);
      expect(captured[0].method).toBe('DELETE');
    });

    test('editing the slot description PATCHes the description', async ({ page }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/work-roles/5',
        'PATCH',
        { ...mockSlot, description: 'Bring your own apron.' },
      );

      await page.getByRole('button', { name: 'Edit description' }).first().click();
      const textarea = page.getByPlaceholder('Description for this event instance');
      await textarea.fill('Bring your own apron.');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH occurrence work role slot was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ description: 'Bring your own apron.' });
    });

    test('adding a slot POSTs the work role link (description is inherited server-side)', async ({
      page,
    }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/work-roles',
        'POST',
        { ...mockSlot, id: 6, inheritedFromWorkRoleId: null },
      );

      await page.locator('input[placeholder="Select work role"]').click();
      await page.getByRole('option', { name: 'Kitchen Helper' }).click();
      await page.getByRole('button', { name: 'Add work role slot' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST occurrence work role slot was called' })
        .toBe(1);
      expect(captured[0].method).toBe('POST');
      expect(captured[0].body).toMatchObject({
        title: 'Kitchen Helper',
        isCritical: false,
        workRoleId: 3,
      });
    });
  });
});
