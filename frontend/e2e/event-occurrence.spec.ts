import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  gotoApp,
  interceptMutation,
  mockCommonApis,
  mockOrgApis,
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
  infoSlots: [
    {
      id: 21,
      seriesId: 1,
      occurrenceId: 9,
      inheritedFromInfoSlotId: 20,
      title: 'Sermon topic',
      description: 'Text of the sermon.',
      value: 'The Good Samaritan',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  parentInfoSlots: [],
  occurrenceInfoSlots: [
    {
      id: 21,
      seriesId: 1,
      occurrenceId: 9,
      inheritedFromInfoSlotId: 20,
      title: 'Sermon topic',
      description: 'Text of the sermon.',
      value: 'The Good Samaritan',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ],
  missingParentInfoSlots: [],
  comments: [
    {
      id: 31,
      seriesId: 1,
      userId: 'user-1',
      userName: 'Test User',
      body: 'Please test the microphones before the event starts.',
      createdAt: '2025-01-01T00:00:00.000Z',
      // Edited later: the UI shows an "edited <date>" marker for this comment.
      updatedAt: '2025-01-03T12:00:00.000Z',
    },
    {
      id: 32,
      seriesId: 1,
      userId: 'user-2',
      userName: 'Second User',
      body: 'Never edited, so no marker.',
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:00:00.000Z',
    },
    {
      id: 33,
      seriesId: 1,
      userId: 'user-2',
      userName: 'Second User',
      body: 'Edited 4 minutes after creation: below the 5-minute threshold.',
      createdAt: '2025-01-02T00:00:00.000Z',
      updatedAt: '2025-01-02T00:04:00.000Z',
    },
  ],
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

// Assignment candidates for slot 5 (linked to work role 3, which requires the
// "Food Safety" certification). user-2 is already assigned to the slot, so it
// is filtered out of the dropdown by the page.
const mockCandidatesSlot5 = [
  {
    id: 'user-1',
    name: 'Test User',
    hasAbsence: false,
    hasWorkRole: true,
    isQualified: true,
    missingCertifications: [],
  },
  {
    id: 'user-4',
    name: 'Fourth User',
    hasAbsence: false,
    hasWorkRole: true,
    isQualified: false,
    missingCertifications: [],
  },
  {
    id: 'user-3',
    name: 'Third User',
    hasAbsence: true,
    hasWorkRole: false,
    isQualified: false,
    missingCertifications: [{ certificationId: 7, name: 'Food Safety', expiredDate: null }],
  },
  {
    id: 'user-2',
    name: 'Second User',
    hasAbsence: false,
    hasWorkRole: true,
    isQualified: false,
    missingCertifications: [{ certificationId: 7, name: 'Food Safety', expiredDate: '2024-01-01' }],
  },
];

// Slot 6 has no linked work role: neutral flags for everyone.
const mockCandidatesSlot6 = [
  {
    id: 'user-1',
    name: 'Test User',
    hasAbsence: false,
    hasWorkRole: false,
    isQualified: false,
    missingCertifications: [],
  },
  {
    id: 'user-3',
    name: 'Third User',
    hasAbsence: false,
    hasWorkRole: false,
    isQualified: false,
    missingCertifications: [],
  },
];

async function setupOccurrencePage(
  page: import('@playwright/test').Page,
  user = adminUser(),
): Promise<void> {
  await mockCommonApis(page, user, [testOrg]);
  await mockOrgApis(page, ORG_ID, { workRoles: [mockWorkRole] });
  await page.route(
    url => url.pathname === '/api/v1/event-series/1/work-roles/5/assignment-candidates',
    route => route.fulfill({ json: mockCandidatesSlot5 }),
  );
  await page.route(
    url => url.pathname === '/api/v1/event-series/1/work-roles/6/assignment-candidates',
    route => route.fulfill({ json: mockCandidatesSlot6 }),
  );
  await page.route(
    url => url.pathname === '/api/v1/event-occurrences/9' && url.search === '',
    route => route.fulfill({ json: mockDetail }),
  );
  await gotoApp(page, '/events/occurrences/9');
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
      await expect(assigneeName).toHaveCSS('font-size', '14px');
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
      await page.getByRole('button', { name: 'Save slot description' }).click();

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

  test.describe('assignment matching', () => {
    test('assignee rows show the same fitness badges as the dropdown', async ({ page }) => {
      await setupOccurrencePage(page, adminUser());

      // Second User is assigned to slot 5: declared the role but not qualified,
      // and holds only an expired Food Safety certification.
      const row = page.getByRole('row').filter({ hasText: 'Second User' });
      await expect(row).toContainText('not qualified');
      await expect(row).toContainText('missing certification: Food Safety (expired 2024-01-01)');
    });

    test('candidates are sorted role-first, flagged users show a warning icon with badges in a hover tooltip', async ({
      page,
    }) => {
      await setupOccurrencePage(page, adminUser());

      // Open the assign modal of the first slot (id 5, linked to work role 3).
      await page.getByRole('button', { name: 'Assign', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input[placeholder="Select user"]').click();

      const options = page.getByRole('option');
      // user-2 is already assigned to the slot, so it is not offered.
      await expect(options).toHaveCount(3);
      // Role declarers first (qualified before unqualified), absent users last.
      await expect(options.nth(0)).toContainText('Test User');
      await expect(options.nth(1)).toContainText('Fourth User');
      await expect(options.nth(2)).toContainText('Third User');
      // Test User has no issues: no warning icon. The others have one.
      await expect(options.nth(0).locator('svg')).toHaveCount(0);
      await expect(options.nth(1).locator('svg')).toHaveCount(1);
      await expect(options.nth(2).locator('svg')).toHaveCount(1);
      // The badges are not inline in the narrow option; they show in a tooltip
      // on hover.
      await expect(options.nth(1)).not.toContainText('not qualified');
      await options.nth(1).hover();
      await expect(page.getByRole('tooltip', { name: 'not qualified' })).toBeVisible();
      await options.nth(2).hover();
      const tooltip = page.getByRole('tooltip', { name: /absent/ });
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText('missing certification: Food Safety');
    });

    test('assigning a flagged user still works (coordinator override) and POSTs the assignment', async ({
      page,
    }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/work-roles/5/assignments',
        'POST',
        {
          id: 12,
          eventWorkRoleId: 5,
          userId: 'user-3',
          userName: 'Third User',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.getByRole('button', { name: 'Assign', exact: true }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.locator('input[placeholder="Select user"]').click();
      // Third User is absent and missing the required certification, but can
      // still be assigned.
      await page.getByRole('option', { name: /Third User/ }).click();
      await dialog.getByRole('button', { name: 'Assign', exact: true }).click();

      await expect.poll(() => captured.length, { message: 'POST assignment was called' }).toBe(1);
      expect(captured[0].method).toBe('POST');
      expect(captured[0].body).toEqual({ userId: 'user-3' });
    });
  });

  test.describe('info slots', () => {
    test('saving an info slot on an unmaterialized (tmp) occurrence materializes it and PATCHes the inherited copy', async ({
      page,
    }) => {
      // Detail for a tmp ref: not materialized, so the parent info slots are shown.
      const tmpRef = 'tmp:1:2025-07-15T10:00:00.000Z';
      const tmpDetail = {
        ...mockDetail,
        occurrence: { ...mockDetail.occurrence, occurrenceId: null },
        workRoles: [],
        parentWorkRoles: [],
        occurrenceWorkRoles: [],
        infoSlots: [
          {
            id: 20,
            seriesId: 1,
            occurrenceId: null,
            inheritedFromInfoSlotId: null,
            title: 'Sermon topic',
            description: 'Text of the sermon.',
            value: null,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        parentInfoSlots: [
          {
            id: 20,
            seriesId: 1,
            occurrenceId: null,
            inheritedFromInfoSlotId: null,
            title: 'Sermon topic',
            description: 'Text of the sermon.',
            value: null,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-01T00:00:00.000Z',
          },
        ],
        occurrenceInfoSlots: [],
        missingParentInfoSlots: [],
        comments: [],
        readiness: { roles: [], isReady: true, unfilledCriticalCount: 0 },
      };

      // A multiline value: info slots accept multi-line text (joined via a
      // char code to keep the literal unambiguous).
      const multilineValue = ['Faith, hope', 'and love'].join(String.fromCharCode(10));

      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { workRoles: [mockWorkRole] });
      await page.route(
        url => url.pathname.includes('/api/v1/event-occurrences/tmp'),
        route => {
          const pathname = new URL(route.request().url()).pathname;
          if (pathname.endsWith('/materialize')) {
            return route.fulfill({ json: { occurrenceId: 9, conflicts: [] } });
          }
          return route.fulfill({ json: tmpDetail });
        },
      );
      // After materialization the page navigates to the numeric occurrence.
      await page.route(
        url => url.pathname === '/api/v1/event-occurrences/9' && url.search === '',
        route => route.fulfill({ json: mockDetail }),
      );

      const materializeCaptured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/tmp*/materialize',
        'POST',
        { occurrenceId: 9, conflicts: [] },
      );
      const patchCaptured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/info-slots/20',
        'PATCH',
        {
          id: 21,
          seriesId: 1,
          occurrenceId: 9,
          inheritedFromInfoSlotId: 20,
          title: 'Sermon topic',
          description: 'Text of the sermon.',
          value: multilineValue,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      );

      await gotoApp(page, `/events/occurrences/${encodeURIComponent(tmpRef)}`);
      await waitForAppReady(page);

      // Typing into the info slot textarea must not crash (regression: the
      // draft updater read event.currentTarget inside a setState updater).
      const textarea = page.getByPlaceholder('Write the information here');
      await expect(textarea).toHaveValue('');
      await textarea.fill(multilineValue);
      await page.getByRole('button', { name: 'Save info slot value' }).click();

      await expect
        .poll(() => materializeCaptured.length, { message: 'materialize was called' })
        .toBe(1);
      await expect
        .poll(() => patchCaptured.length, { message: 'PATCH info slot value was called' })
        .toBe(1);
      expect(patchCaptured[0].method).toBe('PATCH');
      expect(patchCaptured[0].body).toEqual({ value: multilineValue });
    });

    test('shows the info slots with their values and the series description', async ({ page }) => {
      await setupOccurrencePage(page);

      // Series description is displayed read-only.
      await expect(page.getByText('Annual summer event')).toBeVisible();
      // Info slot title, its description and the filled value.
      await expect(page.getByRole('heading', { name: 'Info slots' })).toBeVisible();
      await expect(page.getByText('Sermon topic')).toBeVisible();
      await expect(page.getByText('Text of the sermon.')).toBeVisible();
      await expect(page.getByPlaceholder('Write the information here')).toHaveValue(
        'The Good Samaritan',
      );
    });

    test('regular user sees info slot values read-only without save controls', async ({ page }) => {
      await setupOccurrencePage(page, regularUser());

      await expect(page.getByText('The Good Samaritan')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Info slots' })).toBeVisible();
      await expect(page.getByPlaceholder('Write the information here')).toHaveCount(0);
    });

    test('saving an info slot value PATCHes only the value', async ({ page }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/info-slots/21',
        'PATCH',
        {
          id: 21,
          seriesId: 1,
          occurrenceId: 9,
          inheritedFromInfoSlotId: 20,
          title: 'Sermon topic',
          description: 'Text of the sermon.',
          value: 'Faith, hope and love',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      );

      const textarea = page.getByPlaceholder('Write the information here');
      await textarea.fill('Faith, hope and love');
      // The Save button directly below the info slot textarea.
      await page.getByRole('button', { name: 'Save info slot value' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH info slot value was called' })
        .toBe(1);
      expect(captured[0].method).toBe('PATCH');
      expect(captured[0].body).toEqual({ value: 'Faith, hope and love' });
    });
  });

  test.describe('comments', () => {
    test('shows occurrence comments with author, text and edited marker', async ({ page }) => {
      await setupOccurrencePage(page);

      await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible();
      await expect(page.getByText('Test User').first()).toBeVisible();
      await expect(
        page.getByText('Please test the microphones before the event starts.'),
      ).toBeVisible();
      // The comment was edited more than 5 minutes after creation: an
      // "edited <date>" marker is shown, and only for that comment (the
      // unedited one and the one edited within 5 minutes have no marker).
      await expect(page.getByText(/^edited /)).toHaveCount(1);
    });

    test('regular user sees comments read-only without add/edit/delete controls', async ({
      page,
    }) => {
      await setupOccurrencePage(page, regularUser());

      await expect(
        page.getByText('Please test the microphones before the event starts.'),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add comment' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Edit comment' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Delete comment' })).toHaveCount(0);
    });

    test('author sees edit/delete controls for own comment and can delete it', async ({ page }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/comments/31',
        'DELETE',
        { success: true },
      );

      await expect(page.getByRole('button', { name: 'Edit comment' })).toBeVisible();
      await page.getByRole('button', { name: 'Delete comment' }).click();

      await expect.poll(() => captured.length, { message: 'DELETE comment was called' }).toBe(1);
      expect(captured[0].method).toBe('DELETE');
    });

    test('editing a comment PATCHes the body', async ({ page }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/comments/31',
        'PATCH',
        {
          id: 31,
          seriesId: 1,
          userId: 'user-1',
          userName: 'Test User',
          body: 'Test the microphones 30 minutes early.',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      );

      await page.getByRole('button', { name: 'Edit comment' }).click();
      // The first "Write a comment" textarea is the inline edit of the comment.
      const textarea = page.getByPlaceholder('Write a comment').first();
      await expect(textarea).toHaveValue(/microphones/);
      await textarea.fill('Test the microphones 30 minutes early.');
      await page.getByRole('button', { name: 'Save comment edit' }).click();

      await expect.poll(() => captured.length, { message: 'PATCH comment was called' }).toBe(1);
      expect(captured[0].method).toBe('PATCH');
      expect(captured[0].body).toEqual({ body: 'Test the microphones 30 minutes early.' });
    });

    test('adding a comment POSTs the body to the occurrence comments endpoint', async ({
      page,
    }) => {
      await setupOccurrencePage(page, adminUser());

      const captured = await interceptMutation(
        page,
        '**/api/v1/event-occurrences/9/comments',
        'POST',
        {
          id: 32,
          seriesId: 1,
          userId: 'user-1',
          userName: 'Test User',
          body: 'Bring spare chairs.',
          createdAt: '2025-01-02T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
        },
      );

      await page.getByPlaceholder('Write a comment').fill('Bring spare chairs.');
      await page.getByRole('button', { name: 'Add comment' }).click();

      await expect.poll(() => captured.length, { message: 'POST comment was called' }).toBe(1);
      expect(captured[0].method).toBe('POST');
      expect(captured[0].body).toEqual({ body: 'Bring spare chairs.' });
    });
  });
});
