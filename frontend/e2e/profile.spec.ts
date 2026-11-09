import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  interceptMutation,
  mockCommonApis,
  mockMyWorkRolesAndCerts,
  mockOrgApis,
  ORG_ID,
  pickDate,
  regularUser,
} from './helpers.js';

const testOrg = createOrganization();

const allWorkRoles = [
  {
    id: 1,
    name: 'Setup Crew',
    description: 'Sets up the venue',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Security',
    description: 'Handles security',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 3,
    name: 'Catering',
    description: '',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const allCerts = [
  {
    id: 1,
    name: 'First Aid',
    description: 'Basic first aid certification',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    name: 'Forklift License',
    description: '',
    organizationId: ORG_ID,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

const myWorkRoles = [
  {
    id: 10,
    userId: 'user-1',
    userName: 'Test User',
    userEmail: 'test@example.com',
    workRoleId: 1,
    workRoleName: 'Setup Crew',
    workRoleDescription: 'Sets up the venue',
    isQualified: true,
    notes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

const myCerts = [
  {
    id: 20,
    userId: 'user-1',
    userName: 'Test User',
    certificationId: 1,
    certificationName: 'First Aid',
    certificationDescription: 'Basic first aid certification',
    certificationDate: '2025-01-15',
    validUntilDate: '2027-01-15',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockEventAssignments = {
  items: [
    {
      occurrenceId: 101,
      seriesId: 5,
      title: 'Weekly Community Meeting',
      organizationId: ORG_ID,
      organizationName: 'Test Org',
      occurrenceStart: '2026-11-09T16:00:00.000Z',
      start: '2026-11-09T16:00:00.000Z',
      end: '2026-11-09T17:30:00.000Z',
      isRescheduled: false,
      isCancelled: false,
      roles: [
        {
          slotId: 11,
          title: 'Take minutes',
          workRoleId: 1,
          workRoleName: 'Setup Crew',
          isCritical: true,
        },
      ],
    },
  ],
  total: 1,
  page: 0,
  limit: 5,
};

async function setupProfilePage(
  page: import('@playwright/test').Page,
  user = adminUser(),
  options: {
    workRoles?: typeof allWorkRoles;
    certifications?: typeof allCerts;
    myRoles?: typeof myWorkRoles;
    myCerts?: typeof myCerts;
  } = {},
) {
  const {
    workRoles = allWorkRoles,
    certifications = allCerts,
    myRoles = myWorkRoles,
    myCerts: myCertifications = myCerts,
  } = options;
  await mockCommonApis(page, user, [testOrg]);
  await mockOrgApis(page, ORG_ID, {
    workRoles,
    certifications,
  });
  await mockMyWorkRolesAndCerts(page, ORG_ID, {
    workRoles: myRoles,
    certifications: myCertifications,
  });
  // Mock the current user's event assignments (paginated)
  await page.route(
    url =>
      url.pathname === `/api/v1/organizations/${ORG_ID}/users/${user.id}/event-assignments` &&
      url.searchParams.has('page'),
    route => route.fulfill({ json: mockEventAssignments }),
  );
}

test.describe('Profile page', () => {
  test.describe('data display', () => {
    test('shows personal information', async ({ page }) => {
      await setupProfilePage(page, adminUser({ name: 'John Doe', email: 'john@example.com' }));
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Personal information' })).toBeVisible();
      // "John Doe" appears in both the NavBar and the page content
      await expect(page.getByText('John Doe').first()).toBeVisible();
      await expect(page.getByText('john@example.com')).toBeVisible();
    });

    test('shows assigned work roles with qualified badge', async ({ page }) => {
      await setupProfilePage(page);
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'My work roles' })).toBeVisible();
      // "Setup Crew" also appears as a role badge in the event assignments card.
      await expect(page.getByText('Setup Crew').first()).toBeVisible();
      await expect(page.getByText('Sets up the venue')).toBeVisible();
      await expect(page.getByText('Qualified')).toBeVisible();
    });

    test('shows assigned certifications with dates', async ({ page }) => {
      await setupProfilePage(page);
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'My certifications' })).toBeVisible();
      await expect(page.getByText('First Aid').first()).toBeVisible();
      await expect(page.getByText(/Certified: 2025-01-15/)).toBeVisible();
      await expect(page.getByText(/Valid until: 2027-01-15/)).toBeVisible();
    });

    test('shows empty state when no work roles assigned', async ({ page }) => {
      await setupProfilePage(page, adminUser(), { myRoles: [] });
      await page.goto('/profile');

      await expect(page.getByText('You have not selected any roles yet')).toBeVisible();
    });

    test('shows empty state when no certifications', async ({ page }) => {
      await setupProfilePage(page, adminUser(), { myCerts: [] });
      await page.goto('/profile');

      await expect(page.getByText('You have not added any certifications yet')).toBeVisible();
    });
  });

  test.describe('work role management', () => {
    test('adding a work role calls POST endpoint', async ({ page }) => {
      await setupProfilePage(page, adminUser(), { myRoles: [] });

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/my/work-roles`,
        'POST',
        {
          id: 11,
          userId: 'user-1',
          userName: 'Test User',
          userEmail: 'test@example.com',
          workRoleId: 2,
          workRoleName: 'Security',
          workRoleDescription: 'Handles security',
          isQualified: false,
          notes: '',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.goto('/profile');

      // Select a role from the MultiSelect
      await page.getByPlaceholder('Add a role...').click();
      await page.getByRole('option', { name: 'Security' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST my/work-roles was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ workRoleId: 2 });
    });

    test('removing a work role calls DELETE endpoint', async ({ page }) => {
      await setupProfilePage(page);

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/my/work-roles/10`,
        'DELETE',
      );

      await page.goto('/profile');
      await expect(page.getByText('Setup Crew')).toBeVisible();

      // Click the delete button next to the role
      const roleRow = page.locator('text=Setup Crew').locator('..').locator('..');
      await roleRow.getByRole('button', { name: 'Delete' }).click();

      await expect
        .poll(() => captured.length, { message: 'DELETE my/work-roles/10 was called' })
        .toBe(1);
    });
  });

  test.describe('certification management', () => {
    test('adding a certification calls POST endpoint', async ({ page }) => {
      await setupProfilePage(page, adminUser(), { myCerts: [] });

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/my/certifications`,
        'POST',
        {
          id: 21,
          userId: 'user-1',
          userName: 'Test User',
          certificationId: 2,
          certificationName: 'Forklift License',
          certificationDescription: '',
          certificationDate: '2025-06-01',
          validUntilDate: null,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.goto('/profile');

      // Select certification from dropdown
      await page.getByPlaceholder('Select a certification...').click();
      await page.getByRole('option', { name: 'Forklift License' }).click();

      // Set certification date (the empty picker opens on the current month,
      // so pick a date in the current month)
      const now = new Date();
      const certDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;
      await pickDate(page, 'Certification date', certDate);

      // Click Add certification
      await page.getByRole('button', { name: 'Add certification' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST my/certifications was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({
        certificationId: 2,
        certificationDate: certDate,
      });
    });

    test('removing a certification calls DELETE endpoint', async ({ page }) => {
      await setupProfilePage(page);

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/my/certifications/20`,
        'DELETE',
      );

      await page.goto('/profile');

      // The cert entry contains an Edit button (work role entries do not).
      // Find the ancestor div that has both the Edit and Delete buttons.
      await expect(page.getByText('Certified: 2025-01-15').first()).toBeVisible();
      const editButton = page
        .getByRole('heading', { name: 'My certifications' })
        .locator('..')
        .getByRole('button', { name: 'Edit' });
      await expect(editButton).toBeVisible();
      // The Delete button is a sibling of the Edit button
      await editButton.locator('..').getByRole('button', { name: 'Delete' }).click();

      await expect
        .poll(() => captured.length, { message: 'DELETE my/certifications/20 was called' })
        .toBe(1);
    });

    test('editing certification dates calls PATCH endpoint', async ({ page }) => {
      await setupProfilePage(page);

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/my/certifications/20`,
        'PATCH',
        {
          id: 20,
          userId: 'user-1',
          userName: 'Test User',
          certificationId: 1,
          certificationName: 'First Aid',
          certificationDescription: 'Basic first aid certification',
          certificationDate: '2025-02-01',
          validUntilDate: '2028-01-15',
          createdAt: '2025-01-01T00:00:00.000Z',
        },
      );

      await page.goto('/profile');

      // Find the Edit button within the "My certifications" section
      // (work role entries do not have an Edit button)
      const certsSection = page.getByRole('heading', { name: 'My certifications' }).locator('..');
      await certsSection.getByRole('button', { name: 'Edit' }).click();

      // After clicking Edit, the edit form appears with date pickers that
      // open on the month of their current value (2025-01 and 2027-01). The
      // add form also has these labels, so use last() to get the edit form's.
      await pickDate(page, page.getByLabel('Certification date').last(), '2025-01-20');
      await pickDate(page, page.getByLabel('Valid until').last(), '2027-01-10');

      // Save dates
      await page.getByRole('button', { name: 'Save dates' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH my/certifications/20 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({
        certificationDate: '2025-01-20',
        validUntilDate: '2027-01-10',
      });
    });
  });

  test.describe('permission levels', () => {
    test('regular user can manage their own work roles and certifications', async ({ page }) => {
      await setupProfilePage(page, regularUser());
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
      await expect(page.getByText('Setup Crew').first()).toBeVisible();
      await expect(page.getByText('First Aid').first()).toBeVisible();
    });
  });

  test.describe('event assignments card', () => {
    function expectedDateInput(offsetMonths: number): string {
      const now = new Date();
      const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, now.getDate());
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day}`;
    }

    test('shows the current user’s assigned occurrences with roles and the default date span', async ({
      page,
    }) => {
      await setupProfilePage(page);
      const requests: string[] = [];
      await page.route(
        `**/api/v1/organizations/${ORG_ID}/users/user-1/event-assignments?*`,
        route => {
          requests.push(route.request().url());
          return route.fulfill({ json: mockEventAssignments });
        },
      );
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'Event assignments' })).toBeVisible();
      await expect(page.getByText('Weekly Community Meeting')).toBeVisible();
      // The assigned role badge is shown inside the card.
      await expect(
        page.locator('span.mantine-Badge-label', { hasText: 'Setup Crew' }),
      ).toBeVisible();

      // Date fields default to one month back and forward from today.
      await expect(page.getByLabel('From')).toHaveText(expectedDateInput(-1));
      await expect(page.getByLabel('To')).toHaveText(expectedDateInput(1));

      // The request targets the current user and carries the default span.
      await expect
        .poll(() => requests.length, { message: 'event-assignments was called' })
        .toBeGreaterThan(0);
      const url = new URL(requests[0]);
      expect(url.pathname).toBe(`/api/v1/organizations/${ORG_ID}/users/user-1/event-assignments`);
      expect(url.searchParams.get('page')).toBe('0');
      expect(url.searchParams.get('limit')).toBe('5');
    });

    test('changing the date span refetches with the new range', async ({ page }) => {
      await setupProfilePage(page);
      const requests: string[] = [];
      await page.route(
        `**/api/v1/organizations/${ORG_ID}/users/user-1/event-assignments?*`,
        route => {
          requests.push(route.request().url());
          return route.fulfill({ json: mockEventAssignments });
        },
      );
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'Event assignments' })).toBeVisible();
      // The "To" field defaults to one month ahead, so its picker opens on
      // that month; pick the 5th of it.
      const now = new Date();
      const toDate = new Date(now.getFullYear(), now.getMonth() + 1, 5);
      const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-05`;
      await pickDate(page, 'To', to);

      const expectedEnd = new Date(`${to}T23:59:59`).toISOString().slice(0, 19);
      await expect
        .poll(
          () =>
            requests.some(u => (new URL(u).searchParams.get('end') ?? '').startsWith(expectedEnd)),
          { message: 'event-assignments was called with the new end date' },
        )
        .toBe(true);
    });

    test('regular user without events:read does not see the card', async ({ page }) => {
      await setupProfilePage(page, regularUser());
      await page.goto('/profile');

      await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Event assignments' })).toHaveCount(0);
    });
  });
});
