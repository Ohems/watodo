import { expect, test } from '@playwright/test';
import {
  adminUser,
  interceptMutation,
  mockCommonApis,
  mockUsersList,
  regularUser,
} from './helpers.js';

const mockUsers = [
  {
    id: 'user-1',
    name: 'Alice Anderson',
    email: 'alice@example.com',
    description: '',
    phoneNumber: null,
    permissions: ['admin'],
    state: 'active',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'user-2',
    name: 'Bob Brown',
    email: 'bob@example.com',
    description: '',
    phoneNumber: null,
    permissions: [],
    state: 'active',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
  {
    id: 'user-3',
    name: 'Charlie Clark',
    email: 'charlie@example.com',
    description: '',
    phoneNumber: '+358401234567',
    permissions: [],
    state: 'inactive',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2025-01-03T00:00:00.000Z',
    updatedAt: '2025-01-03T00:00:00.000Z',
  },
];

test.describe('Contacts page (UserList)', () => {
  test.describe('data display', () => {
    test('shows all users with their names and emails', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users');

      await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
      await expect(page.getByText('Alice Anderson')).toBeVisible();
      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('Bob Brown')).toBeVisible();
      await expect(page.getByText('bob@example.com')).toBeVisible();
      await expect(page.getByText('Charlie Clark')).toBeVisible();
      await expect(page.getByText('charlie@example.com')).toBeVisible();
    });

    test('shows the "Add new user" card', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users');

      await expect(page.getByText('Add new user')).toBeVisible();
    });

    test('shows empty state when no users', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, []);
      await page.goto('/users');

      await expect(page.getByRole('heading', { name: 'Contacts' })).toBeVisible();
      // Only the "Add new user" card should be present
      await expect(page.getByText('Add new user')).toBeVisible();
    });
  });

  test.describe('navigation', () => {
    test('clicking a user card navigates to their profile', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users');

      await page.getByText('Alice Anderson').click();
      await expect(page).toHaveURL('/users/user-1');
    });

    test('clicking "Add new user" navigates to the new user page', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users');

      await page.getByText('Add new user').click();
      await expect(page).toHaveURL('/users/new');
    });
  });

  test.describe('permission levels', () => {
    test('regular user (no permissions) can still view the contacts list', async ({ page }) => {
      await mockCommonApis(page, regularUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users');

      await expect(page.getByText('Alice Anderson')).toBeVisible();
      await expect(page.getByText('Bob Brown')).toBeVisible();
    });
  });
});

test.describe('UserProfile page', () => {
  test.describe('data display', () => {
    test('shows user details in read-only mode', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users/user-1');

      await expect(page.getByRole('heading', { name: 'Alice Anderson' })).toBeVisible();
      // Fields are shown as text (not inputs) in read-only mode
      await expect(page.getByText('alice@example.com')).toBeVisible();
      // Permissions displayed
      await expect(page.getByText('admin')).toBeVisible();
      // State displayed
      await expect(page.getByText('Active')).toBeVisible();
    });

    test('shows "Not set" for empty description', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users/user-1');

      // Description is empty so "Not set" should be shown
      const descSection = page.locator('text=Description').locator('..');
      await expect(descSection.getByText('Not set')).toBeVisible();
    });

    test('shows user state as Inactive for inactive users', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users/user-3');

      await expect(page.getByText('Inactive')).toBeVisible();
    });

    test('shows empty permissions as "None"', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users/user-2');

      const permSection = page.locator('text=Permissions').locator('..');
      await expect(permSection.getByText('None')).toBeVisible();
    });
  });

  test.describe('editing', () => {
    test('admin can edit a user and save calls the PATCH endpoint', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);

      const updatedUser = { ...mockUsers[0], name: 'Alice Updated' };
      const captured = await interceptMutation(
        page,
        '**/api/v1/users/user-1',
        'PATCH',
        updatedUser,
      );

      await page.goto('/users/user-1');
      await expect(page.getByRole('heading', { name: 'Alice Anderson' })).toBeVisible();

      // Click Edit
      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

      // Change the name field
      const nameInput = page.getByRole('textbox', { name: 'Name' });
      await nameInput.fill('Alice Updated');

      // Save
      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /users/user-1 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Alice Updated' });
    });

    test('cancel discards changes', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users/user-1');

      await page.getByRole('button', { name: 'Edit' }).click();
      const nameInput = page.getByRole('textbox', { name: 'Name' });
      await nameInput.fill('Changed Name');
      await page.getByRole('button', { name: 'Cancel' }).click();

      // Back to read-only mode showing original name
      await expect(page.getByRole('heading', { name: 'Alice Anderson' })).toBeVisible();
    });
  });

  test.describe('navigation', () => {
    test('back to list button returns to contacts', async ({ page }) => {
      await mockCommonApis(page, adminUser());
      await mockUsersList(page, mockUsers);
      await page.goto('/users/user-1');

      await page.getByRole('button', { name: 'Back to list' }).click();
      await expect(page).toHaveURL('/users');
    });
  });
});
