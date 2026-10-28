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
} from './helpers.js';

const testOrg = createOrganization();

const mockTeams = [
  {
    id: 'team-1',
    name: 'Setup Team',
    description: 'Handles venue setup',
    organizationId: ORG_ID,
    memberCount: 3,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'team-2',
    name: 'Security Team',
    description: '',
    organizationId: ORG_ID,
    memberCount: 5,
    createdAt: '2025-01-02T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
  },
];

const mockTeamDetail = mockTeams[0];
const mockMembers = [
  {
    id: 1,
    teamId: 'team-1',
    userId: 'user-1',
    userName: 'Alice Anderson',
    userEmail: 'alice@example.com',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 2,
    teamId: 'team-1',
    userId: 'user-2',
    userName: 'Bob Brown',
    userEmail: 'bob@example.com',
    createdAt: '2025-01-01T00:00:00.000Z',
  },
];

const mockAllUsers = [
  { id: 'user-1', name: 'Alice Anderson' },
  { id: 'user-2', name: 'Bob Brown' },
  { id: 'user-3', name: 'Charlie Clark' },
];

async function setupTeamsPage(
  page: import('@playwright/test').Page,
  user = adminUser(),
  teams = mockTeams,
) {
  await mockCommonApis(page, user, [testOrg]);
  await mockOrgApis(page, ORG_ID, { teams });
}

async function setupTeamDetail(page: import('@playwright/test').Page, user = adminUser()) {
  await mockCommonApis(page, user, [testOrg]);
  await mockOrgApis(page, ORG_ID, { teams: mockTeams });
  await mockUserList(page, mockAllUsers);
  await page.route(`**/api/v1/organizations/${ORG_ID}/teams/team-1`, route =>
    route.fulfill({ json: mockTeamDetail }),
  );
  await page.route(`**/api/v1/organizations/${ORG_ID}/teams/team-1/members`, route =>
    route.fulfill({ json: mockMembers }),
  );
}

test.describe('Teams page', () => {
  test.describe('data display', () => {
    test('shows teams in a table with member counts', async ({ page }) => {
      await setupTeamsPage(page);
      await page.goto('/teams');

      await expect(page.getByRole('heading', { name: 'Teams' })).toBeVisible();
      await expect(page.getByText('Setup Team')).toBeVisible();
      await expect(page.getByText('Handles venue setup')).toBeVisible();
      await expect(page.getByText('3', { exact: true })).toBeVisible();
      await expect(page.getByText('Security Team')).toBeVisible();
      await expect(page.getByText('5', { exact: true })).toBeVisible();
    });

    test('shows empty state when no teams', async ({ page }) => {
      await setupTeamsPage(page, adminUser(), []);
      await page.goto('/teams');

      await expect(page.getByText('No results found')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees the Add button', async ({ page }) => {
      await setupTeamsPage(page, adminUser());
      await page.goto('/teams');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('user with team-management:write sees the Add button', async ({ page }) => {
      await setupTeamsPage(page, userWithPermissions(['team-management:write']));
      await page.goto('/teams');

      await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
    });

    test('regular user does not see the Add button', async ({ page }) => {
      await setupTeamsPage(page, regularUser());
      await page.goto('/teams');

      await expect(page.getByRole('button', { name: 'Add' })).toHaveCount(0);
      await expect(page.getByText('Setup Team')).toBeVisible();
    });
  });

  test.describe('creating a team', () => {
    test('admin can create a team and POST is called', async ({ page }) => {
      await setupTeamsPage(page, adminUser(), []);

      const newTeam = {
        id: 'team-new',
        name: 'Catering Team',
        description: 'Food and drinks',
        organizationId: ORG_ID,
        memberCount: 0,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };
      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/teams`,
        'POST',
        newTeam,
      );

      await page.goto('/teams');
      await page.getByRole('button', { name: 'Add' }).click();

      await expect(page.getByRole('heading', { name: 'New team' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Name' }).fill('Catering Team');
      await page.getByRole('textbox', { name: 'Description' }).fill('Food and drinks');
      await page.getByRole('button', { name: 'Save' }).click();

      await expect.poll(() => captured.length, { message: 'POST /teams was called' }).toBe(1);
      expect(captured[0].body).toMatchObject({
        name: 'Catering Team',
        description: 'Food and drinks',
      });
    });
  });

  test.describe('navigation', () => {
    test('clicking a team row navigates to team management', async ({ page }) => {
      await setupTeamsPage(page);
      await page.goto('/teams');

      await page.getByText('Setup Team').click();
      await expect(page).toHaveURL('/teams/team-1');
    });
  });
});

test.describe('Team Management page', () => {
  test.describe('data display', () => {
    test('shows team details and members', async ({ page }) => {
      await setupTeamDetail(page);
      await page.goto('/teams/team-1');

      await expect(page.getByRole('heading', { name: 'Setup Team' })).toBeVisible();
      await expect(page.getByText('Handles venue setup')).toBeVisible();

      // Members table
      await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
      await expect(page.getByText('Alice Anderson')).toBeVisible();
      await expect(page.getByText('alice@example.com')).toBeVisible();
      await expect(page.getByText('Bob Brown')).toBeVisible();
      await expect(page.getByText('bob@example.com')).toBeVisible();
    });
  });

  test.describe('permission-based UI', () => {
    test('admin sees Edit button and Add member button', async ({ page }) => {
      await setupTeamDetail(page, adminUser());
      await page.goto('/teams/team-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add member' })).toBeVisible();
    });

    test('regular user sees no edit/add buttons', async ({ page }) => {
      await setupTeamDetail(page, regularUser());
      await page.goto('/teams/team-1');

      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0);
      // Members still visible
      await expect(page.getByText('Alice Anderson')).toBeVisible();
    });
  });

  test.describe('editing team', () => {
    test('admin can edit team and save calls PATCH endpoint', async ({ page }) => {
      await mockCommonApis(page, adminUser(), [testOrg]);
      await mockOrgApis(page, ORG_ID, { teams: mockTeams });
      await mockUserList(page, mockAllUsers);
      await page.route(`**/api/v1/organizations/${ORG_ID}/teams/team-1/members`, route =>
        route.fulfill({ json: mockMembers }),
      );

      const updatedTeam = { ...mockTeamDetail, name: 'Setup Team Renamed' };
      const captured: { url: string; method: string; body: unknown }[] = [];
      // Single route handling both GET and PATCH on the same URL
      await page.route(`**/api/v1/organizations/${ORG_ID}/teams/team-1`, async route => {
        if (route.request().method() === 'PATCH') {
          const body = JSON.parse(route.request().postData() ?? '{}');
          captured.push({ url: route.request().url(), method: 'PATCH', body });
          return route.fulfill({ json: updatedTeam });
        }
        return route.fulfill({ json: mockTeamDetail });
      });

      await page.goto('/teams/team-1');

      await page.getByRole('button', { name: 'Edit' }).click();
      await expect(page.getByRole('heading', { name: 'Edit team' })).toBeVisible();

      const nameInput = page.getByRole('textbox').first();
      await nameInput.fill('Setup Team Renamed');

      await page.getByRole('button', { name: 'Save' }).click();

      await expect
        .poll(() => captured.length, { message: 'PATCH /teams/team-1 was called' })
        .toBe(1);
      expect(captured[0].body).toMatchObject({ name: 'Setup Team Renamed' });
    });
  });

  test.describe('member management', () => {
    test('admin can add a member', async ({ page }) => {
      await setupTeamDetail(page, adminUser());

      const newMember = {
        id: 3,
        teamId: 'team-1',
        userId: 'user-3',
        userName: 'Charlie Clark',
        userEmail: 'charlie@example.com',
        createdAt: '2025-01-01T00:00:00.000Z',
      };
      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/teams/team-1/members`,
        'POST',
        newMember,
      );

      await page.goto('/teams/team-1');

      await page.getByRole('button', { name: 'Add member' }).click();
      await expect(page.getByRole('heading', { name: 'Add member' })).toBeVisible();

      await page.getByPlaceholder('Select...').click();
      await page.getByRole('option', { name: 'Charlie Clark' }).click();

      await page.getByRole('button', { name: 'Add', exact: true }).click();

      await expect
        .poll(() => captured.length, { message: 'POST /teams/team-1/members was called' })
        .toBe(1);
      expect(captured[0].body).toEqual({ userId: 'user-3' });
    });

    test('admin can remove a member', async ({ page }) => {
      await setupTeamDetail(page, adminUser());

      const captured = await interceptMutation(
        page,
        `**/api/v1/organizations/${ORG_ID}/teams/team-1/members/user-2`,
        'DELETE',
      );

      await page.goto('/teams/team-1');

      // Find the delete button in Bob's row
      const bobRow = page.locator('tr', { hasText: 'Bob Brown' });
      await bobRow.getByRole('button').click();

      // Confirm in modal
      await expect(page.getByText('Remove Bob Brown from Setup Team?')).toBeVisible();
      await page.getByRole('button', { name: 'Delete' }).click();

      await expect
        .poll(() => captured.length, { message: 'DELETE /teams/team-1/members/user-2 was called' })
        .toBe(1);
    });
  });

  test.describe('navigation', () => {
    test('back to list button returns to teams', async ({ page }) => {
      await setupTeamDetail(page, adminUser());
      await page.goto('/teams/team-1');

      await page.getByRole('button', { name: 'Back to teams' }).click();
      await expect(page).toHaveURL('/teams');
    });
  });
});
