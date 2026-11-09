import { expect, type Page, test } from '@playwright/test';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { mockAuthProviders } from './helpers.js';

const ORG_ID = 'org-1';

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
  phoneNumber: null,
  language: 'en-GB',
  weekStart: 'sunday',
  dateFormat: 'ymd',
  timeFormat: '24h',
  permissions: ['admin'],
  state: 'active',
  isEmployed: true,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

const mockOrganization = {
  id: ORG_ID,
  name: 'Test Org',
  description: '',
  defaultTimezone: 'UTC',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
};

/**
 * Stubs every API call the calendar page needs and injects an auth token so
 * the app renders the calendar instead of the login screen.
 */
async function mockApi(page: Page, user: typeof mockUser = mockUser) {
  await page.addInitScript(() => {
    localStorage.setItem('watodo_token', 'e2e-test-token');
  });
  // More specific routes are registered after the generic ones because
  // Playwright matches routes in reverse registration order.
  await page.route('**/api/v1/users/@me', route => route.fulfill({ json: user }));
  await page.route('**/api/v1/organizations', route => route.fulfill({ json: [mockOrganization] }));
  await mockAuthProviders(page);
  await page.route(`**/api/v1/organizations/${ORG_ID}/sites/all`, route =>
    route.fulfill({ json: [] }),
  );
  await page.route(`**/api/v1/organizations/${ORG_ID}/rooms/all*`, route =>
    route.fulfill({ json: [] }),
  );
  await page.route(`**/api/v1/organizations/${ORG_ID}/teams?*`, route =>
    route.fulfill({ json: { items: [], total: 0, page: 0, limit: 200 } }),
  );
  await page.route('**/api/v1/event-series/occurrences?*', route => route.fulfill({ json: [] }));
}

/** Label formats mirror the react-big-calendar date-fns localizer defaults. */
function monthLabel(date: Date): string {
  return format(date, 'MMMM yyyy');
}

function weekLabel(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 0 });
  const end = endOfWeek(date, { weekStartsOn: 0 });
  const endText = isSameMonth(start, end) ? format(end, 'dd') : format(end, 'MMMM dd');
  return `${format(start, 'MMMM dd')} – ${endText}`;
}

function dayLabel(date: Date): string {
  return format(date, 'cccc MMM dd');
}

function toolbar(page: Page) {
  return page.locator('.rbc-toolbar');
}

function toolbarLabel(page: Page) {
  return toolbar(page).locator('.rbc-toolbar-label');
}

async function clickNavigate(page: Page, name: 'Today' | 'Back' | 'Next') {
  await toolbar(page).getByRole('button', { name, exact: true }).click();
}

async function switchView(page: Page, name: 'Month' | 'Week' | 'Day' | 'Agenda') {
  await toolbar(page).getByRole('button', { name, exact: true }).click();
}

async function openCalendar(page: Page, user: typeof mockUser = mockUser) {
  await mockApi(page, user);
  await page.goto('/events/calendar');
  await expect(page.locator('.rbc-calendar')).toBeVisible();
  await expect(toolbarLabel(page)).toHaveText(monthLabel(new Date()));
}

/** Texts of the month view's weekday header cells, in display order. */
function weekdayHeaders(page: Page) {
  return page.locator('.rbc-month-header .rbc-header');
}

test.describe('Calendar page navigation', () => {
  test('toolbar label follows month navigation', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(addMonths(now, 1)));

    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(now));

    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(subMonths(now, 1)));
  });

  test('rapid Back presses move one month at a time without getting stuck or skipping', async ({
    page,
  }) => {
    await openCalendar(page);
    const now = new Date();

    for (let i = 0; i < 3; i++) {
      await clickNavigate(page, 'Back');
    }
    await expect(toolbarLabel(page)).toHaveText(monthLabel(subMonths(now, 3)));

    for (let i = 0; i < 3; i++) {
      await clickNavigate(page, 'Next');
    }
    await expect(toolbarLabel(page)).toHaveText(monthLabel(now));
  });

  test('navigates between weeks in week view', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await switchView(page, 'Week');
    await expect(toolbarLabel(page)).toHaveText(weekLabel(now));

    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(weekLabel(addWeeks(now, 1)));

    await clickNavigate(page, 'Back');
    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(weekLabel(subWeeks(now, 1)));
  });

  test('navigates between days in day view', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await switchView(page, 'Day');
    await expect(toolbarLabel(page)).toHaveText(dayLabel(now));

    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(dayLabel(addDays(now, 1)));

    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(dayLabel(now));
  });

  test('Today returns to the current month after navigating away', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await clickNavigate(page, 'Next');
    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(addMonths(now, 2)));

    await clickNavigate(page, 'Today');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(now));
  });
});

test.describe('Calendar week start', () => {
  test('the month view starts the week on Sunday by default', async ({ page }) => {
    await openCalendar(page);

    await expect(weekdayHeaders(page).first()).toHaveText('Sun');
    await expect(weekdayHeaders(page).nth(6)).toHaveText('Sat');
  });

  test('the month view starts the week on Monday when the user configured it', async ({ page }) => {
    await openCalendar(page, { ...mockUser, weekStart: 'monday' });

    await expect(weekdayHeaders(page).first()).toHaveText('Mon');
    await expect(weekdayHeaders(page).nth(6)).toHaveText('Sun');
  });

  test('the week view starts on Monday when the user configured it', async ({ page }) => {
    await openCalendar(page, { ...mockUser, weekStart: 'monday' });
    const now = new Date();

    await switchView(page, 'Week');
    // With Monday as the first day, the week's label starts on the Monday of
    // the current week (date-fns weeks are Sunday-based unless weekStartsOn says otherwise).
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    const endText = isSameMonth(start, end) ? format(end, 'dd') : format(end, 'MMMM dd');
    await expect(toolbarLabel(page)).toHaveText(`${format(start, 'MMMM dd')} – ${endText}`);
  });
});
