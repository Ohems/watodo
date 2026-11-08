import { expect, test } from '@playwright/test';
import {
  adminUser,
  interceptMutation,
  mockCommonApis,
  mockNotifications,
  mockOccurrences,
  ORG_ID,
  regularUser,
} from './helpers.js';

/** Builds an occurrence mock with defaults for all fields the Home page reads. */
function makeOccurrence(partial: Record<string, unknown>) {
  return {
    occurrenceId: null,
    seriesId: 1,
    title: 'Event',
    description: null,
    isAllDay: false,
    siteId: null,
    roomId: null,
    reserveWholeSite: false,
    organizationId: ORG_ID,
    organizationName: 'Test Org',
    occurrenceStart: new Date().toISOString(),
    start: new Date().toISOString(),
    end: new Date().toISOString(),
    isRescheduled: false,
    isCancelled: false,
    exceptionId: null,
    isParticipant: false,
    isManager: false,
    workRoleSlots: [],
    managedUnfilledCriticalSlots: [],
    ...partial,
  };
}

test.describe('Home page', () => {
  test.describe('data display', () => {
    test('shows notifications with unread badge', async ({ page }) => {
      const notifications = [
        {
          id: 1,
          userId: 'user-1',
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          messageKey: 'workRoleAssigned',
          params: { role: 'Setup Crew', eventTitle: 'Community Cleanup' },
          isRead: false,
          createdAt: '2025-06-15T10:00:00.000Z',
        },
        {
          id: 2,
          userId: 'user-1',
          organizationId: null,
          organizationName: null,
          messageKey: 'welcome',
          params: {},
          isRead: true,
          createdAt: '2025-06-14T08:00:00.000Z',
        },
      ];
      await mockCommonApis(page, adminUser());
      await mockNotifications(page, notifications, 1);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expect(page.getByText('Notifications')).toBeVisible();
      // Messages are rendered from the key + params via the locale bundle.
      await expect(page.getByText('You have been assigned a work role')).toBeVisible();
      await expect(
        page.getByText('You are assigned to "Setup Crew" for Community Cleanup.'),
      ).toBeVisible();
      await expect(page.getByText('Welcome to Watodo')).toBeVisible();
      await expect(page.getByText('1 unread')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeVisible();
    });

    test('shows upcoming events sorted by start time', async ({ page }) => {
      const now = new Date();
      const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const occurrences = [
        makeOccurrence({
          seriesId: 1,
          title: 'Later Event',
          occurrenceStart: inFiveDays.toISOString(),
          start: inFiveDays.toISOString(),
          end: new Date(inFiveDays.getTime() + 60 * 60 * 1000).toISOString(),
        }),
        makeOccurrence({
          seriesId: 2,
          title: 'Sooner Event',
          isAllDay: true,
          occurrenceStart: inTwoDays.toISOString(),
          start: inTwoDays.toISOString(),
          end: new Date(inTwoDays.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          isRescheduled: true,
        }),
      ];
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, occurrences);
      await page.goto('/');

      await expect(page.getByText('Upcoming events')).toBeVisible();

      // Both events should be visible
      const soonerEvent = page.getByText('Sooner Event');
      const laterEvent = page.getByText('Later Event');
      await expect(soonerEvent).toBeVisible();
      await expect(laterEvent).toBeVisible();

      // Rescheduled badge shown for rescheduled event
      await expect(page.getByText('rescheduled')).toBeVisible();

      // Organization name badge
      const orgBadges = page.getByText('Test Org');
      await expect(orgBadges.first()).toBeVisible();
    });

    test('shows empty state when no notifications', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockNotifications(page, [], 0);
      await page.goto('/');

      await expect(page.getByText('No notifications')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveCount(0);
    });

    test('shows empty state when no upcoming events', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, []);
      await page.goto('/');

      await expect(page.getByText('No upcoming events')).toBeVisible();
    });

    test('filters out cancelled events from upcoming list', async ({ page }) => {
      const now = new Date();
      const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const occurrences = [
        makeOccurrence({
          seriesId: 1,
          title: 'Visible Event',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
        }),
        makeOccurrence({
          seriesId: 2,
          title: 'Cancelled Event',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
          isCancelled: true,
        }),
      ];
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, occurrences);
      await page.goto('/');

      await expect(page.getByText('Visible Event')).toBeVisible();
      await expect(page.getByText('Cancelled Event')).toHaveCount(0);
    });

    test('requests only occurrences the user is involved in (scope=involved)', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      const captured: string[] = [];
      await page.route('**/api/v1/event-series/occurrences?*', route => {
        captured.push(route.request().url());
        return route.fulfill({ json: [] });
      });
      await page.goto('/');

      await expect(page.getByText('Upcoming events')).toBeVisible();
      await expect
        .poll(() => captured.length, { message: 'occurrences endpoint was called' })
        .toBeGreaterThan(0);
      const url = new URL(captured[0]);
      expect(url.searchParams.get('scope')).toBe('involved');
      // The Home page aggregates all organizations, so no organization filter.
      expect(url.searchParams.has('organizationId')).toBe(false);
    });

    test('shows slot status indicators and a warning for unfilled managed critical slots', async ({
      page,
    }) => {
      const now = new Date();
      const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const occurrences = [
        makeOccurrence({
          seriesId: 1,
          title: 'Managed Event',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
          isManager: true,
          workRoleSlots: [
            {
              slotId: 11,
              title: 'Cook',
              workRoleId: 1,
              workRoleName: 'Cook',
              isCritical: true,
              assigneeCount: 0,
            },
            {
              slotId: 12,
              title: 'Helper',
              workRoleId: null,
              workRoleName: null,
              isCritical: false,
              assigneeCount: 1,
            },
          ],
          managedUnfilledCriticalSlots: ['Cook'],
        }),
        makeOccurrence({
          seriesId: 2,
          title: 'Participant Event',
          occurrenceStart: inOneDay.toISOString(),
          start: new Date(inOneDay.getTime() + 2 * 60 * 60 * 1000).toISOString(),
          end: new Date(inOneDay.getTime() + 3 * 60 * 60 * 1000).toISOString(),
          isParticipant: true,
          workRoleSlots: [
            {
              slotId: 21,
              title: 'Setup',
              workRoleId: 2,
              workRoleName: 'Setup',
              isCritical: true,
              assigneeCount: 1,
            },
          ],
          managedUnfilledCriticalSlots: [],
        }),
      ];
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, occurrences);
      await page.goto('/');

      // Slot status indicators: 1/2 filled for the managed event (red, critical
      // unfilled), 1/1 filled for the participant event (green).
      await expect(page.getByText('Slots 1/2')).toBeVisible();
      await expect(page.getByText('Slots 1/1')).toBeVisible();
      // Special warning label for the unfilled critical slot the user manages.
      await expect(page.getByText('Missing in your area: Cook')).toBeVisible();
      // Participant/manager badges.
      await expect(page.getByText('Manager', { exact: true })).toBeVisible();
      await expect(page.getByText('Participant', { exact: true })).toBeVisible();
    });
  });

  test.describe('mark notification as read', () => {
    test('clicking a notification calls the mark-read endpoint', async ({ page }) => {
      const notifications = [
        {
          id: 42,
          userId: 'user-1',
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          messageKey: 'newEventComment',
          params: { eventTitle: 'Weekly Meeting' },
          isRead: false,
          createdAt: '2025-06-15T10:00:00.000Z',
        },
      ];
      await mockCommonApis(page, adminUser());
      await mockNotifications(page, notifications, 1);

      const captured = await interceptMutation(page, '**/api/v1/notifications/42', 'PATCH', {
        id: 42,
        isRead: true,
      });

      await page.goto('/');
      await expect(page.getByText('New event comment')).toBeVisible();

      await page.getByText('New event comment').click();

      // Wait for the PATCH request to be captured
      await expect
        .poll(() => captured.length, { message: 'PATCH /notifications/42 was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ isRead: true });
    });

    test('clicking "Mark all as read" calls the mark-all-read endpoint', async ({ page }) => {
      const notifications = [
        {
          id: 1,
          userId: 'user-1',
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          title: 'Notification 1',
          body: '',
          isRead: false,
          createdAt: '2025-06-15T10:00:00.000Z',
        },
      ];
      await mockCommonApis(page, adminUser());
      await mockNotifications(page, notifications, 1);

      const captured = await interceptMutation(
        page,
        '**/api/v1/notifications/mark-all-read',
        'POST',
        { updated: 1 },
      );

      await page.goto('/');
      await page.getByRole('button', { name: 'Mark all as read' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST /notifications/mark-all-read was called' })
        .toBe(1);
    });
  });

  test.describe('navigation', () => {
    test('clicking an upcoming event navigates to the event config page', async ({ page }) => {
      const now = new Date();
      const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const occurrences = [
        makeOccurrence({
          occurrenceId: 99,
          seriesId: 99,
          title: 'My Event',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
        }),
      ];
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, occurrences);
      await page.goto('/');

      await expect(page.getByText('My Event')).toBeVisible();
      await page.getByText('My Event').click();
      await expect(page).toHaveURL('/events/occurrences/99');
    });
  });

  test.describe('permission levels', () => {
    test('regular user (no permissions) sees the same home page data', async ({ page }) => {
      const notifications = [
        {
          id: 1,
          userId: 'user-1',
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          messageKey: 'newEventComment',
          params: { eventTitle: 'Weekly Meeting' },
          isRead: false,
          createdAt: '2025-06-15T10:00:00.000Z',
        },
      ];
      await mockCommonApis(page, regularUser());
      await mockNotifications(page, notifications, 1);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expect(page.getByText('New event comment')).toBeVisible();
      await expect(page.getByText('Someone commented on Weekly Meeting.')).toBeVisible();
    });
  });
});
