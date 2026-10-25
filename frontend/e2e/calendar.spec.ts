import { expect, type Page, test } from '@playwright/test';
import moment from 'moment';

const ORG_ID = 'org-1';

const mockUser = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
  phoneNumber: null,
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
async function mockApi(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('watodo_token', 'e2e-test-token');
  });
  // More specific routes are registered after the generic ones because
  // Playwright matches routes in reverse registration order.
  await page.route('**/api/v1/users/@me', route => route.fulfill({ json: mockUser }));
  await page.route('**/api/v1/organizations', route => route.fulfill({ json: [mockOrganization] }));
  await page.route(`**/api/v1/organizations/${ORG_ID}/locations/all`, route =>
    route.fulfill({ json: [] }),
  );
  await page.route(`**/api/v1/organizations/${ORG_ID}/teams?*`, route =>
    route.fulfill({ json: { items: [], total: 0, page: 0, limit: 200 } }),
  );
  await page.route('**/api/v1/event-series/occurrences?*', route => route.fulfill({ json: [] }));
}

/** Label formats mirror the react-big-calendar moment localizer defaults. */
function monthLabel(date: Date): string {
  return moment(date).format('MMMM YYYY');
}

function weekLabel(date: Date): string {
  const start = moment(date).startOf('week');
  const end = moment(date).endOf('week');
  const endText = start.isSame(end, 'month') ? end.format('DD') : end.format('MMMM DD');
  return `${start.format('MMMM DD')} – ${endText}`;
}

function dayLabel(date: Date): string {
  return moment(date).format('dddd MMM DD');
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

async function openCalendar(page: Page) {
  await mockApi(page);
  await page.goto('/events/calendar');
  await expect(page.locator('.rbc-calendar')).toBeVisible();
  await expect(toolbarLabel(page)).toHaveText(monthLabel(new Date()));
}

test.describe('Calendar page navigation', () => {
  test('toolbar label follows month navigation', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(moment(now).add(1, 'month').toDate()));

    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(now));

    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(
      monthLabel(moment(now).subtract(1, 'month').toDate()),
    );
  });

  test('rapid Back presses move one month at a time without getting stuck or skipping', async ({
    page,
  }) => {
    await openCalendar(page);
    const now = new Date();

    for (let i = 0; i < 3; i++) {
      await clickNavigate(page, 'Back');
    }
    await expect(toolbarLabel(page)).toHaveText(
      monthLabel(moment(now).subtract(3, 'month').toDate()),
    );

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
    await expect(toolbarLabel(page)).toHaveText(weekLabel(moment(now).add(1, 'week').toDate()));

    await clickNavigate(page, 'Back');
    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(
      weekLabel(moment(now).subtract(1, 'week').toDate()),
    );
  });

  test('navigates between days in day view', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await switchView(page, 'Day');
    await expect(toolbarLabel(page)).toHaveText(dayLabel(now));

    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(dayLabel(moment(now).add(1, 'day').toDate()));

    await clickNavigate(page, 'Back');
    await expect(toolbarLabel(page)).toHaveText(dayLabel(now));
  });

  test('Today returns to the current month after navigating away', async ({ page }) => {
    await openCalendar(page);
    const now = new Date();

    await clickNavigate(page, 'Next');
    await clickNavigate(page, 'Next');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(moment(now).add(2, 'month').toDate()));

    await clickNavigate(page, 'Today');
    await expect(toolbarLabel(page)).toHaveText(monthLabel(now));
  });
});
