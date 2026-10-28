import type { Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

export interface MockUser {
  id: string;
  name: string;
  email: string;
  description: string;
  phoneNumber: string | null;
  permissions: string[];
  state: 'active' | 'inactive';
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export function createUser(overrides: Partial<MockUser> = {}): MockUser {
  return {
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
    ...overrides,
  };
}

/** An admin user (bypasses all permission checks). */
export function adminUser(overrides: Partial<MockUser> = {}): MockUser {
  return createUser({ permissions: ['admin'], ...overrides });
}

/** A regular user with no permissions (read-only). */
export function regularUser(overrides: Partial<MockUser> = {}): MockUser {
  return createUser({ permissions: [], ...overrides });
}

/** A user with specific permissions. */
export function userWithPermissions(
  permissions: string[],
  overrides: Partial<MockUser> = {},
): MockUser {
  return createUser({ permissions, ...overrides });
}

export interface MockOrganization {
  id: string;
  name: string;
  description: string;
  defaultTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export function createOrganization(overrides: Partial<MockOrganization> = {}): MockOrganization {
  return {
    id: 'org-1',
    name: 'Test Org',
    description: 'A test organization',
    defaultTimezone: 'UTC',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export const ORG_ID = 'org-1';

// ---------------------------------------------------------------------------
// API mocking helpers
// ---------------------------------------------------------------------------

/** Sets the auth token in localStorage before any page script runs. */
export async function setAuthToken(page: Page, token = 'e2e-test-token'): Promise<void> {
  await page.addInitScript(t => {
    localStorage.setItem('watodo_token', t);
  }, token);
}

/** Mocks the current-user endpoint. */
export async function mockCurrentUser(page: Page, user: MockUser): Promise<void> {
  await page.route('**/api/v1/users/@me', route => route.fulfill({ json: user }));
}

/** Mocks the organizations list endpoint. */
export async function mockOrganizations(
  page: Page,
  orgs: MockOrganization[] = [createOrganization()],
): Promise<void> {
  await page.route('**/api/v1/organizations', route => route.fulfill({ json: orgs }));
}

/** Mocks the auth providers endpoint. */
export async function mockAuthProviders(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/providers', route =>
    route.fulfill({
      json: {
        providers: [
          { id: 'discord', name: 'Discord', configured: true },
          { id: 'google', name: 'Google', configured: true },
          { id: 'microsoft', name: 'Microsoft', configured: true },
        ],
      },
    }),
  );
}

/** Mocks the notifications endpoint. */
export async function mockNotifications(
  page: Page,
  items: unknown[] = [],
  unreadCount = 0,
): Promise<void> {
  await page.route('**/api/v1/notifications*', route =>
    route.fulfill({
      json: { items, total: items.length, page: 0, limit: 10, unreadCount },
    }),
  );
}

/** Mocks the occurrences endpoint (used by Home and Calendar). */
export async function mockOccurrences(page: Page, occurrences: unknown[] = []): Promise<void> {
  await page.route('**/api/v1/event-series/occurrences?*', route =>
    route.fulfill({ json: occurrences }),
  );
}

/**
 * Mocks all APIs commonly needed across pages: current user, organizations,
 * auth providers, notifications, and occurrences.
 */
export async function mockCommonApis(
  page: Page,
  user: MockUser = adminUser(),
  orgs: MockOrganization[] = [createOrganization()],
): Promise<void> {
  await setAuthToken(page);
  await mockCurrentUser(page, user);
  await mockOrganizations(page, orgs);
  await mockAuthProviders(page);
  await mockNotifications(page);
  await mockOccurrences(page);
}

/**
 * Mocks all APIs needed by organization-scoped pages (sites, rooms, teams,
 * work roles, certifications, org users).
 */
export async function mockOrgApis(
  page: Page,
  orgId = ORG_ID,
  options: {
    sites?: unknown[];
    rooms?: unknown[];
    teams?: unknown[];
    workRoles?: unknown[];
    certifications?: unknown[];
    orgUsers?: unknown[];
  } = {},
): Promise<void> {
  const {
    sites = [],
    rooms = [],
    teams = [],
    workRoles = [],
    certifications = [],
    orgUsers = [],
  } = options;

  // Use predicates to avoid intercepting single-entity requests (e.g. /sites/site-1)
  // when only the list endpoint (e.g. /sites?page=0) should be mocked.
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/sites/all`,
    route => route.fulfill({ json: sites }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/sites` && url.searchParams.has('page'),
    route => route.fulfill({ json: { items: sites, total: sites.length, page: 0, limit: 50 } }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/rooms/all`,
    route => route.fulfill({ json: rooms }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/rooms` && url.searchParams.has('page'),
    route => route.fulfill({ json: { items: rooms, total: rooms.length, page: 0, limit: 50 } }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/teams` && url.searchParams.has('page'),
    route => route.fulfill({ json: { items: teams, total: teams.length, page: 0, limit: 200 } }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/work-roles/all`,
    route => route.fulfill({ json: workRoles }),
  );
  await page.route(
    url =>
      url.pathname === `/api/v1/organizations/${orgId}/work-roles` && url.searchParams.has('page'),
    route =>
      route.fulfill({ json: { items: workRoles, total: workRoles.length, page: 0, limit: 50 } }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/certifications/all`,
    route => route.fulfill({ json: certifications }),
  );
  await page.route(
    url =>
      url.pathname === `/api/v1/organizations/${orgId}/certifications` &&
      url.searchParams.has('page'),
    route =>
      route.fulfill({
        json: { items: certifications, total: certifications.length, page: 0, limit: 50 },
      }),
  );
  await page.route(
    url => url.pathname === `/api/v1/organizations/${orgId}/users` && url.searchParams.has('page'),
    route =>
      route.fulfill({ json: { items: orgUsers, total: orgUsers.length, page: 0, limit: 50 } }),
  );
}

/**
 * Mocks the current user's work roles and certifications (self-service
 * endpoints used by the Profile page).
 */
export async function mockMyWorkRolesAndCerts(
  page: Page,
  orgId = ORG_ID,
  options: { workRoles?: unknown[]; certifications?: unknown[] } = {},
): Promise<void> {
  const { workRoles = [], certifications = [] } = options;
  await page.route(`**/api/v1/organizations/${orgId}/my/work-roles`, route =>
    route.fulfill({ json: workRoles }),
  );
  await page.route(`**/api/v1/organizations/${orgId}/my/certifications`, route =>
    route.fulfill({ json: certifications }),
  );
}

/** Mocks the users list endpoint (Contacts page). */
export async function mockUsersList(page: Page, users: unknown[] = []): Promise<void> {
  await page.route('**/api/v1/users?*', route => route.fulfill({ json: users }));
}

/** Mocks the simple user list endpoint (used by team management). */
export async function mockUserList(page: Page, users: unknown[] = []): Promise<void> {
  await page.route('**/api/v1/users/list', route => route.fulfill({ json: users }));
}

/** Mocks the auth accounts endpoint. */
export async function mockAuthAccounts(
  page: Page,
  accounts: { provider: string; providerAccountId: string; createdAt: string }[] = [],
): Promise<void> {
  await page.route('**/api/v1/users/@me/auth-accounts', route => route.fulfill({ json: accounts }));
}

/** Mocks the event series management list endpoint. */
export async function mockEventSeriesManagement(page: Page, items: unknown[] = []): Promise<void> {
  await page.route(
    url => url.pathname === '/api/v1/event-series/management' && url.searchParams.has('page'),
    route => route.fulfill({ json: { items, total: items.length, page: 0, limit: 50 } }),
  );
}

// ---------------------------------------------------------------------------
// Request interception helpers
// ---------------------------------------------------------------------------

export interface CapturedRequest {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Intercepts requests matching a URL pattern and records them. Returns an
 * array that is populated as requests arrive.
 */
export async function captureRequests(
  page: Page,
  urlPattern: string | RegExp,
  method?: string,
): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = [];
  await page.route(urlPattern, async (route: Route) => {
    const request = route.request();
    if (method && request.method() !== method) {
      return route.continue();
    }
    let body: unknown = null;
    const postData = request.postData();
    if (postData) {
      try {
        body = JSON.parse(postData);
      } catch {
        body = postData;
      }
    }
    captured.push({ url: request.url(), method: request.method(), body });
    // Fulfill with a generic success response; tests can override the route
    // after this call if they need a specific response.
    await route.fulfill({ json: {} });
  });
  return captured;
}

/**
 * Intercepts a mutation request (POST/PATCH/DELETE) and fulfills it with the
 * provided response while recording the request body. Non-matching methods are
 * passed through via route.continue(). Note: when the same URL is also mocked
 * for GET (e.g. /users/@me), register a single route that handles both methods
 * instead of using this helper, because route.continue() may not fall through
 * to earlier page.route handlers reliably.
 */
export async function interceptMutation(
  page: Page,
  urlPattern: string | RegExp,
  method: string,
  response: unknown = {},
): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = [];
  await page.route(urlPattern, async (route: Route) => {
    const request = route.request();
    if (request.method() !== method) {
      return route.continue();
    }
    let body: unknown = null;
    const postData = request.postData();
    if (postData) {
      try {
        body = JSON.parse(postData);
      } catch {
        body = postData;
      }
    }
    captured.push({ url: request.url(), method: request.method(), body });
    await route.fulfill({ json: response });
  });
  return captured;
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/** Waits for the app to finish loading (spinner gone, content visible). */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for the NavBar to appear (indicates authenticated app is loaded)
  await page.locator('header').waitFor({ state: 'visible' });
}
