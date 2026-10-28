import { expect, test } from '@playwright/test';
import {
  adminUser,
  createOrganization,
  interceptMutation,
  mockCommonApis,
  mockMyWorkRolesAndCerts,
  mockOrgApis,
  ORG_ID,
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
      await expect(page.getByText('Setup Crew')).toBeVisible();
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

      // Set certification date
      const dateInputs = page.getByLabel('Certification date');
      await dateInputs.fill('2025-06-01');

      // Click Add certification
      await page.getByRole('button', { name: 'Add certification' }).click();

      await expect
        .poll(() => captured.length, { message: 'POST my/certifications was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({
        certificationId: 2,
        certificationDate: '2025-06-01',
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

      // After clicking Edit, the edit form appears with date inputs.
      // The add form also has these labels, so use last() to get the edit form's inputs.
      await page.getByLabel('Certification date').last().fill('2025-02-01');
      await page.getByLabel('Valid until').last().fill('2028-01-15');

      // Save dates
      await page.getByRole('button', { name: 'Save dates' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH my/certifications/20 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({
        certificationDate: '2025-02-01',
        validUntilDate: '2028-01-15',
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
});
