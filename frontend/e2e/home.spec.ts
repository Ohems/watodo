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

test.describe('Home page', () => {
  test.describe('data display', () => {
    test('shows notifications with unread badge', async ({ page }) => {
      const notifications = [
        {
          id: 1,
          userId: 'user-1',
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          title: 'New assignment',
          body: 'You were assigned to Setup Crew',
          isRead: false,
          createdAt: '2025-06-15T10:00:00.000Z',
        },
        {
          id: 2,
          userId: 'user-1',
          organizationId: null,
          organizationName: null,
          title: 'System update',
          body: 'The system was updated',
          isRead: true,
          createdAt: '2025-06-14T08:00:00.000Z',
        },
      ];
      await mockCommonApis(page, adminUser());
      await mockNotifications(page, notifications, 1);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expect(page.getByText('Notifications')).toBeVisible();
      await expect(page.getByText('New assignment')).toBeVisible();
      await expect(page.getByText('You were assigned to Setup Crew')).toBeVisible();
      await expect(page.getByText('System update')).toBeVisible();
      await expect(page.getByText('1 unread')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mark all as read' })).toBeVisible();
    });

    test('shows upcoming events sorted by start time', async ({ page }) => {
      const now = new Date();
      const inTwoDays = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
      const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
      const occurrences = [
        {
          seriesId: 1,
          title: 'Later Event',
          description: null,
          isAllDay: false,
          siteId: null,
          roomId: null,
          reserveWholeSite: false,
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          occurrenceStart: inFiveDays.toISOString(),
          start: inFiveDays.toISOString(),
          end: new Date(inFiveDays.getTime() + 60 * 60 * 1000).toISOString(),
          isRescheduled: false,
          isCancelled: false,
          exceptionId: null,
        },
        {
          seriesId: 2,
          title: 'Sooner Event',
          description: null,
          isAllDay: true,
          siteId: null,
          roomId: null,
          reserveWholeSite: false,
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          occurrenceStart: inTwoDays.toISOString(),
          start: inTwoDays.toISOString(),
          end: new Date(inTwoDays.getTime() + 24 * 60 * 60 * 1000).toISOString(),
          isRescheduled: true,
          isCancelled: false,
          exceptionId: null,
        },
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
        {
          seriesId: 1,
          title: 'Visible Event',
          description: null,
          isAllDay: false,
          siteId: null,
          roomId: null,
          reserveWholeSite: false,
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
          isRescheduled: false,
          isCancelled: false,
          exceptionId: null,
        },
        {
          seriesId: 2,
          title: 'Cancelled Event',
          description: null,
          isAllDay: false,
          siteId: null,
          roomId: null,
          reserveWholeSite: false,
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
          isRescheduled: false,
          isCancelled: true,
          exceptionId: null,
        },
      ];
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, occurrences);
      await page.goto('/');

      await expect(page.getByText('Visible Event')).toBeVisible();
      await expect(page.getByText('Cancelled Event')).toHaveCount(0);
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
          title: 'Click me',
          body: 'Unread notification',
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
      await expect(page.getByText('Click me')).toBeVisible();

      await page.getByText('Click me').click();

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
        {
          seriesId: 99,
          title: 'My Event',
          description: null,
          isAllDay: false,
          siteId: null,
          roomId: null,
          reserveWholeSite: false,
          organizationId: ORG_ID,
          organizationName: 'Test Org',
          occurrenceStart: inOneDay.toISOString(),
          start: inOneDay.toISOString(),
          end: new Date(inOneDay.getTime() + 60 * 60 * 1000).toISOString(),
          isRescheduled: false,
          isCancelled: false,
          exceptionId: null,
        },
      ];
      await mockCommonApis(page, adminUser());
      await mockOccurrences(page, occurrences);
      await page.goto('/');

      await expect(page.getByText('My Event')).toBeVisible();
      await page.getByText('My Event').click();
      await expect(page).toHaveURL('/events/99');
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
          title: 'Hello',
          body: 'World',
          isRead: false,
          createdAt: '2025-06-15T10:00:00.000Z',
        },
      ];
      await mockCommonApis(page, regularUser());
      await mockNotifications(page, notifications, 1);
      await page.goto('/');

      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expect(page.getByText('Hello')).toBeVisible();
      await expect(page.getByText('World')).toBeVisible();
    });
  });
});
