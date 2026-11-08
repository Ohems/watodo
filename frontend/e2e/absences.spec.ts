import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  interceptMutation,
  mockCommonApis,
  regularUser,
} from './helpers.js';

const testOrg = createOrganization({ name: 'Acme Events' });

// Dates relative to today so the current-month calendar view shows an event.
const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays: number): string =>
  new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10);
const today = isoDay(0);
const inTwoDays = isoDay(2);
const nextWeek = isoDay(7);
const nextWeekEnd = isoDay(9);

const absences = [
  {
    id: 1,
    userId: 'user-1',
    type: 'sick',
    description: 'Flu',
    startDate: today,
    endDate: inTwoDays,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 2,
    userId: 'user-1',
    type: 'away',
    description: 'Vacation',
    startDate: nextWeek,
    endDate: nextWeekEnd,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  },
];

/** Mocks the absences list endpoint (absences are self-service, no permissions needed). */
async function mockAbsences(page: import('@playwright/test').Page, data = absences) {
  await page.route('**/api/v1/users/@me/absences?*', route => route.fulfill({ json: data }));
  await page.route('**/api/v1/users/@me/absences', route => route.fulfill({ json: data }));
}

/** The settings button contains the user avatar; find it by the avatar alt text. */
function settingsButton(page: import('@playwright/test').Page) {
  return page.locator('header button').filter({ has: page.locator('[class*="Avatar"]') });
}

test.describe('Absences page', () => {
  test.describe('data display', () => {
    test('shows the absences from the API in the list and on the calendar', async ({ page }) => {
      await mockCommonApis(page, adminUser({ name: 'Alice' }), [testOrg]);
      await mockAbsences(page);
      await page.goto('/absences');

      await expect(page.getByRole('heading', { name: 'Absences', exact: true })).toBeVisible();
      await expect(page.getByText('Sick', { exact: true })).toBeVisible();
      await expect(page.getByText('Away', { exact: true })).toBeVisible();
      await expect(page.getByText(`${today} - ${inTwoDays}`)).toBeVisible();
      await expect(page.getByText(`${nextWeek} - ${nextWeekEnd}`)).toBeVisible();
      await expect(page.getByText('Flu', { exact: true })).toBeVisible();
      await expect(page.getByText('Vacation', { exact: true })).toBeVisible();
      // Calendar renders the absence as an all-day event in the current month.
      await expect(page.locator('.rbc-event').filter({ hasText: 'Sick' }).first()).toBeVisible();
    });

    test('shows an empty state when there are no absences', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockAbsences(page, []);
      await page.goto('/absences');

      await expect(page.getByText('No absences yet')).toBeVisible();
    });
  });

  test.describe('permission levels', () => {
    test('a regular user without permissions can also see and add absences', async ({ page }) => {
      await mockCommonApis(page, regularUser(), [testOrg]);
      await mockAbsences(page);
      await page.goto('/absences');

      await expect(page.getByRole('heading', { name: 'Absences', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add absence' })).toBeVisible();
      await expect(page.getByText('Flu', { exact: true })).toBeVisible();
    });
  });

  test.describe('editing', () => {
    test('adding an absence calls POST /api/v1/users/@me/absences with the form body', async ({
      page,
    }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockAbsences(page);
      const created = await interceptMutation(page, '**/api/v1/users/@me/absences', 'POST', {
        ...absences[0],
        id: 3,
        type: 'other',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
      });
      await page.goto('/absences');

      await page.getByRole('button', { name: 'Add absence' }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();

      const dateInputs = dialog.locator('input[type="date"]');
      await dateInputs.nth(0).fill('2026-11-01');
      await dateInputs.nth(1).fill('2026-11-02');
      await dialog.locator('textarea').fill('Moved house');
      await dialog.getByRole('combobox').click();
      await page.getByRole('option', { name: 'Other' }).click();
      await dialog.getByRole('button', { name: 'Save' }).click();

      await expect.poll(() => created.length).toBe(1);
      expect(created[0].method).toBe('POST');
      expect(created[0].body).toEqual({
        type: 'other',
        description: 'Moved house',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
      });
    });

    test('deleting an absence calls DELETE /api/v1/users/@me/absences/:id', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockAbsences(page);
      const deleted = await interceptMutation(
        page,
        /\/api\/v1\/users\/@me\/absences\/\d+$/,
        'DELETE',
        { success: true },
      );
      await page.goto('/absences');

      await page.getByRole('button', { name: 'Delete' }).first().click();

      await expect.poll(() => deleted.length).toBe(1);
      expect(deleted[0].method).toBe('DELETE');
      expect(deleted[0].url).toContain('/api/v1/users/@me/absences/1');
    });
  });

  test.describe('navigation', () => {
    test('the user menu contains Absences and navigates to /absences', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockAbsences(page);
      await page.goto('/');

      await settingsButton(page).click();
      await expect(page.getByRole('menuitem', { name: 'Absences' })).toBeVisible();
      await page.getByRole('menuitem', { name: 'Absences' }).click();
      await expect(page).toHaveURL('/absences');
      await expect(page.getByRole('heading', { name: 'Absences', exact: true })).toBeVisible();
    });
  });
});

test.describe('Home quick actions', () => {
  test('the Add absence quick action opens the absence dialog and posts the new absence', async ({
    page,
  }) => {
    await mockCommonApis(page, adminUser(), [testOrg]);
    await mockAbsences(page, []);
    const created = await interceptMutation(page, '**/api/v1/users/@me/absences', 'POST', {
      ...absences[0],
      id: 5,
      type: 'sick',
    });
    await page.goto('/');

    await page.getByRole('button', { name: 'Add absence' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const dateInputs = dialog.locator('input[type="date"]');
    await dateInputs.nth(0).fill('2026-12-01');
    await dateInputs.nth(1).fill('2026-12-03');
    await dialog.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Sick' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => created.length).toBe(1);
    expect(created[0].body).toMatchObject({
      type: 'sick',
      startDate: '2026-12-01',
      endDate: '2026-12-03',
    });
  });
});
