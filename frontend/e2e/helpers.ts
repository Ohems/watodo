import type { Locator, Page, Route } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock data factories
// ---------------------------------------------------------------------------

/**
 * Picks a date (yyyy-mm-dd) in a date field (a DateField/DateTimeField
 * button, given as a label or locator). The picker opens on the month of the
 * field's current value (or the current month when empty), so the date must
 * be in that displayed month. Day buttons are labelled with their full date
 * (e.g. "10 November 2026").
 */
export async function pickDate(page: Page, field: string | Locator, date: string): Promise<void> {
  const [year, month, day] = date.split('-').map(Number);
  const locator = typeof field === 'string' ? page.getByLabel(field) : field;
  await locator.click();
  // The open picker's target references its dropdown via aria-controls; closed
  // pickers keep their dropdown mounted, so scope the day button to the open one.
  const dropdownId = await locator.getAttribute('aria-controls');
  const dropdown = dropdownId
    ? page.locator(`[id="${dropdownId}"]`)
    : page.locator('[data-dates-dropdown]:visible');
  const monthName = new Date(year, month - 1, day).toLocaleString('en-GB', { month: 'long' });
  // exact: "5 December 2026" must not match "15 December 2026"
  await dropdown.getByRole('button', { name: `${day} ${monthName} ${year}`, exact: true }).click();
}

export interface MockUser {
  id: string;
  name: string;
  email: string;
  description: string;
  phoneNumber: string | null;
  language: string;
  weekStart: string;
  dateFormat: string;
  timeFormat: string;
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

/**
 * The configurable notification message keys of the backend catalog (all
 * except `welcome`), in catalog order, with their settings category:
 * `general` notifications go to everyone, `management` ones only to
 * event/team managers.
 */
export const NOTIFICATION_MESSAGE_KEYS: { key: string; category: string }[] = [
  { key: 'upcomingEvent', category: 'general' },
  { key: 'workRoleAssigned', category: 'general' },
  { key: 'workRoleUnassigned', category: 'general' },
  { key: 'newEventComment', category: 'general' },
  { key: 'roleAssigned', category: 'general' },
  { key: 'eventCancelled', category: 'general' },
  { key: 'eventRescheduled', category: 'general' },
  { key: 'unfilledCriticalSlot', category: 'management' },
  { key: 'assignmentRemovedDueToAbsence', category: 'management' },
];

const NOTIFICATION_CHANNELS = ['in_app', 'email', 'push'] as const;

export interface MockNotificationPreference {
  messageKey: string;
  channel: string;
  enabled: boolean;
  category: string;
}

/**
 * Mocks the notification preferences endpoints (Account page). Without
 * overrides every key x channel is returned with the channel default (in-app
 * and email on, push off). PATCH requests update the served state, so a
 * refetch after a toggle reflects the saved value.
 */
export async function mockNotificationPreferences(
  page: Page,
  overrides: { messageKey: string; channel: string; enabled: boolean }[] = [],
): Promise<void> {
  const preferences: MockNotificationPreference[] = NOTIFICATION_MESSAGE_KEYS.flatMap(
    ({ key, category }) =>
      NOTIFICATION_CHANNELS.map(channel => {
        const override = overrides.find(o => o.messageKey === key && o.channel === channel);
        return {
          messageKey: key,
          channel,
          enabled: override?.enabled ?? channel !== 'push',
          category,
        };
      }),
  );
  await page.route(
    url => url.pathname.startsWith('/api/v1/users/@me/notification-preferences'),
    route => {
      const request = route.request();
      if (request.method() === 'PATCH') {
        const segments = new URL(request.url()).pathname.split('/');
        const messageKey = segments.at(-2) ?? '';
        const channel = segments.at(-1) ?? '';
        const body = request.postDataJSON() as { enabled?: boolean };
        const enabled = body.enabled ?? true;
        const existing = preferences.find(
          p => p.messageKey === messageKey && p.channel === channel,
        );
        if (existing) existing.enabled = enabled;
        return route.fulfill({
          json: { messageKey, channel, enabled, category: existing?.category ?? 'general' },
        });
      }
      return route.fulfill({
        json: { channels: [...NOTIFICATION_CHANNELS], preferences },
      });
    },
  );
}

/** A valid-looking base64url VAPID public key (65-byte P-256 point) for mocks. */
export const MOCK_VAPID_PUBLIC_KEY =
  'BNUmgNFGR-ttXNJe1Bm0SQ2-17fSZ2Zt7SZIQ0Qu3-IMNNh2nTt1iEc8-PbscygX2qpC634VoAmEta8tnFEZRF8';

export interface MockPushSubscription {
  id: number;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

/**
 * Mocks the web push endpoints (Account page notification settings): the VAPID
 * public key and the per-user push subscriptions. POST/DELETE update the
 * served state, so a refetch after enabling/disabling reflects the change.
 */
export async function mockPushApis(
  page: Page,
  options: { vapidKey?: string; subscriptions?: MockPushSubscription[] } = {},
): Promise<void> {
  const vapidKey = options.vapidKey ?? MOCK_VAPID_PUBLIC_KEY;
  const subscriptions = [...(options.subscriptions ?? [])];
  await page.route(
    url => url.pathname === '/api/v1/push/vapid-public-key',
    route => route.fulfill({ json: { publicKey: vapidKey } }),
  );
  await page.route(
    url => url.pathname.startsWith('/api/v1/users/@me/push-subscriptions'),
    route => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { endpoint: string; userAgent?: string };
        const subscription: MockPushSubscription = {
          id: subscriptions.length + 1,
          endpoint: body.endpoint,
          userAgent: body.userAgent ?? null,
          createdAt: '2026-01-01T00:00:00.000Z',
        };
        subscriptions.push(subscription);
        return route.fulfill({ json: subscription });
      }
      if (request.method() === 'DELETE') {
        const id = Number(new URL(request.url()).pathname.split('/').at(-1));
        const index = subscriptions.findIndex(s => s.id === id);
        if (index === -1) {
          return route.fulfill({ status: 404, json: { error: 'Not found!' } });
        }
        subscriptions.splice(index, 1);
        return route.fulfill({ json: { success: true } });
      }
      return route.fulfill({ json: subscriptions });
    },
  );
}

// Notification message bundles mirroring the backend catalog (the frontend
// fetches them from GET /api/v1/locales/:lng and renders messages with them).
const NOTIFICATION_BUNDLE_EN = {
  welcome: {
    title: 'Welcome to Watodo',
    body: 'Your organisation has been set up. Explore the calendar and invite your team.',
  },
  upcomingEvent: {
    title: 'Upcoming event',
    body: '{{eventTitle}} is happening this month. Check the calendar for details.',
  },
  workRoleAssigned: {
    title: 'You have been assigned a work role',
    body: 'You are assigned to "{{role}}" for {{eventTitle}}.',
  },
  workRoleUnassigned: {
    title: 'Work role assignment removed',
    body: 'You are no longer assigned to "{{role}}" for {{eventTitle}}.',
  },
  newEventComment: {
    title: 'New event comment',
    body: 'Someone commented on {{eventTitle}}.',
  },
  roleAssigned: {
    title: 'Role assigned',
    body: 'You have been assigned the {{roleName}} role.',
  },
  eventCancelled: {
    title: 'Event cancelled',
    body: '{{eventTitle}} on {{start}} has been cancelled.',
  },
  eventRescheduled: {
    title: 'Event rescheduled',
    body: '{{eventTitle}} ({{start}}) has been rescheduled to {{newStart}} - {{newEnd}}.',
  },
  unfilledCriticalSlot: {
    title: 'Critical role still unfilled',
    body: 'Critical role(s) still unfilled for {{eventTitle}} on {{start}}: {{roles}}.',
  },
  assignmentRemovedDueToAbsence: {
    title: 'Assignment removed due to absence',
    body: '{{userName}} was removed from "{{eventTitle}}" ({{start}}).',
  },
};

const NOTIFICATION_BUNDLE_FI = {
  welcome: {
    title: 'Tervetuloa Watodoon',
    body: 'Organisaatiosi on nyt perustettu. Tutki kalenteria ja kutsu tiimisi mukaan.',
  },
  upcomingEvent: {
    title: 'Tuleva tapahtuma',
    body: '{{eventTitle}} järjestetään tässä kuussa. Katso lisätiedot kalenterista.',
  },
  workRoleAssigned: {
    title: 'Sinut on määrätty työrooliin',
    body: 'Sinut on määrätty rooliin "{{role}}" tapahtumaan {{eventTitle}}.',
  },
  workRoleUnassigned: {
    title: 'Työroolimääritys poistettu',
    body: 'Sinua ei enää ole määrätty rooliin "{{role}}" tapahtumassa {{eventTitle}}.',
  },
  newEventComment: {
    title: 'Uusi tapahtumakommentti',
    body: 'Joku kommentoi tapahtumaa {{eventTitle}}.',
  },
  roleAssigned: {
    title: 'Rooli määrätty',
    body: 'Sinulle on määrätty rooli {{roleName}}.',
  },
  eventCancelled: {
    title: 'Tapahtuma peruttu',
    body: '{{eventTitle}} ({{start}}) on peruttu.',
  },
  eventRescheduled: {
    title: 'Tapahtuma siirretty',
    body: '{{eventTitle}} ({{start}}) on siirretty aikaan {{newStart}} - {{newEnd}}.',
  },
  unfilledCriticalSlot: {
    title: 'Kriittinen rooli täyttämättä',
    body: 'Kriittinen rooli/roolit ovat edelleen täyttämättä tapahtumassa {{eventTitle}} ({{start}}): {{roles}}.',
  },
  assignmentRemovedDueToAbsence: {
    title: 'Määritys poistettu poissaolon vuoksi',
    body: '{{userName}} poistettiin tapahtumasta "{{eventTitle}}" ({{start}}).',
  },
};

const NOTIFICATION_BUNDLES: Record<string, unknown> = {
  'en-GB': NOTIFICATION_BUNDLE_EN,
  'en-US': NOTIFICATION_BUNDLE_EN,
  fi: NOTIFICATION_BUNDLE_FI,
};

/** Mocks the locale bundle endpoint (server-owned notification templates). */
export async function mockLocaleBundles(page: Page): Promise<void> {
  await page.route('**/api/v1/locales/*', route => {
    const lng = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'en-GB';
    return route.fulfill({
      json: { lng, notifications: NOTIFICATION_BUNDLES[lng] ?? NOTIFICATION_BUNDLE_EN },
    });
  });
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
  await mockLocaleBundles(page);
  await mockNotifications(page);
  await mockNotificationPreferences(page);
  await mockPushApis(page);
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
    eventTypes?: unknown[];
  } = {},
): Promise<void> {
  const {
    sites = [],
    rooms = [],
    teams = [],
    workRoles = [],
    certifications = [],
    orgUsers = [],
    eventTypes = [],
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
    url => url.pathname === `/api/v1/organizations/${orgId}/event-types`,
    route => route.fulfill({ json: eventTypes }),
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
      // Fall back to an earlier registered handler (e.g. the GET mock for
      // the same URL) instead of continuing to the network: route.continue()
      // does not fall through to earlier page.route handlers.
      return route.fallback();
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

/**
 * Navigates to an app route. Uses `domcontentloaded` instead of the default
 * `load`: waiting for full load (fonts, images, ...) only slows the test
 * down, and `waitForAppReady` already waits for a concrete element afterwards.
 */
export async function gotoApp(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
}

/** Waits for the app to finish loading (spinner gone, content visible). */
export async function waitForAppReady(page: Page): Promise<void> {
  // Wait for the NavBar to appear (indicates authenticated app is loaded)
  await page.locator('header').waitFor({ state: 'visible' });
}
