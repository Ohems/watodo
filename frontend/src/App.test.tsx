import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.js';
import { api, clearToken } from './api/index.js';
import { store } from './store/index.js';
import { type MockApi, mockApi } from './test/api-mock.js';
import type {
  EventOccurrence,
  EventSeriesManagement,
  Notification,
  Organization,
  User,
} from './types/index.js';

const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
  phoneNumber: null,
  permissions: ['admin'],
  state: 'active',
  isEmployed: true,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockOrganization: Organization = {
  id: 'org-1',
  name: 'Community Org',
  description: 'A community organization',
  defaultTimezone: 'Europe/Helsinki',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const mockSeries: EventSeriesManagement = {
  id: 13,
  title: 'Summer Festival',
  description: null,
  calendarId: 'cal-1',
  siteId: null,
  roomId: null,
  reserveWholeSite: false,
  organizationId: 'org-1',
  organizationName: 'Community Org',
  start: '2026-06-01T10:00:00.000Z',
  durationMinutes: 120,
  isAllDay: false,
  timezone: 'Europe/Helsinki',
  isVisible: true,
  rrule: null,
  recurrence: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  siteName: null,
  roomName: null,
  teams: [],
};

function renderApp(route = '/', strict = false) {
  window.history.pushState({}, '', route);
  const tree = (
    <BrowserRouter>
      <MantineProvider>
        <App />
      </MantineProvider>
    </BrowserRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

/** Mocks the endpoints used by the app shell and the Home page. */
function mockShellRoutes(mock: MockApi) {
  mock.on('GET', '/api/v1/users/@me', mockUser);
  mock.on('GET', '/api/v1/organizations', [mockOrganization]);
  mock.on('GET', '/api/v1/notifications', {
    items: [],
    total: 0,
    page: 0,
    limit: 10,
    unreadCount: 0,
  });
  mock.on('GET', '/api/v1/event-series/occurrences', []);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function makeOccurrence(partial: Partial<EventOccurrence> & { seriesId: number }) {
  const start = new Date(Date.now() + DAY_MS).toISOString();
  return {
    title: `Event ${partial.seriesId}`,
    description: null,
    isAllDay: false,
    siteId: null,
    roomId: null,
    reserveWholeSite: false,
    organizationId: 'org-1',
    organizationName: 'Community Org',
    occurrenceStart: start,
    start,
    end: new Date(Date.now() + 2 * DAY_MS).toISOString(),
    isRescheduled: false,
    isCancelled: false,
    exceptionId: null,
    ...partial,
  } satisfies EventOccurrence;
}

function lastCallUrl(mock: MockApi, pathname: string): string | undefined {
  const call = [...mock.calls]
    .reverse()
    .find(c => c.method === 'GET' && new URL(c.url).pathname === pathname);
  return call?.url;
}

let mock: MockApi;

beforeEach(() => {
  mock = mockApi();
  localStorage.clear();
  clearToken();
  store.dispatch(api.util.resetApiState());
  window.history.pushState({}, '', '/');
});

describe('App', () => {
  it('shows the login page when the user is unauthenticated', async () => {
    mock.on('GET', '/api/v1/users/@me', { error: 'Unauthorized' }, 401);
    mock.on('GET', '/api/v1/auth/providers', { providers: [] });

    renderApp();

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
  });

  it('renders the app shell once the user is authenticated', async () => {
    mockShellRoutes(mock);

    renderApp();

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    const logos = screen.getAllByAltText('WATODO');
    expect(logos.length).toBeGreaterThan(0);
  });

  it('renders navigation links once the user is authenticated', async () => {
    mockShellRoutes(mock);

    renderApp();

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Events').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Teams').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Organization').length).toBeGreaterThan(0);
  });

  it('renders the Home page on home route once the user is authenticated', async () => {
    mockShellRoutes(mock);

    renderApp();

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('shows the active organization in the navigation bar once authenticated', async () => {
    mockShellRoutes(mock);

    renderApp();

    expect(
      await screen.findByRole('combobox', { name: 'Select organization' }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Community Org')).length).toBeGreaterThan(0);
  });

  it('renders the organization page with the active organization details', async () => {
    mockShellRoutes(mock);

    renderApp('/organization');

    expect(await screen.findByRole('heading', { name: 'Community Org' })).toBeInTheDocument();
    expect(screen.getByText('A community organization')).toBeInTheDocument();
    expect(screen.getByText('Europe/Helsinki')).toBeInTheDocument();
  });

  it('loads an event page without duplicate API requests, even in StrictMode', async () => {
    mockShellRoutes(mock);
    mock.on('GET', '/api/v1/event-series/13/management', mockSeries);
    mock.on('GET', '/api/v1/organizations/org-1/sites/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/rooms/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/teams', {
      items: [],
      total: 0,
      page: 0,
      limit: 200,
    });

    renderApp('/events/13', true);

    expect(await screen.findByRole('heading', { name: 'Summer Festival' })).toBeInTheDocument();
    await waitFor(() => {
      expect(mock.callCount('GET', '/api/v1/users/@me')).toBe(1);
      expect(mock.callCount('GET', '/api/v1/organizations')).toBe(1);
      expect(mock.callCount('GET', '/api/v1/event-series/13/management')).toBe(1);
      expect(mock.callCount('GET', '/api/v1/organizations/org-1/sites/all')).toBe(1);
      expect(mock.callCount('GET', '/api/v1/organizations/org-1/rooms/all')).toBe(1);
      expect(mock.callCount('GET', '/api/v1/organizations/org-1/teams')).toBe(1);
    });
  });
});

describe('Home', () => {
  it('shows upcoming events from all organizations, each labeled with its organization', async () => {
    mockShellRoutes(mock);
    const notification: Notification = {
      id: 1,
      userId: '1',
      organizationId: 'org-2',
      organizationName: 'Other Org',
      title: 'You have been assigned a job',
      body: 'You are assigned to "Room setup".',
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    mock.on('GET', '/api/v1/notifications', {
      items: [notification],
      total: 1,
      page: 0,
      limit: 10,
      unreadCount: 1,
    });
    mock.on('GET', '/api/v1/event-series/occurrences', [
      makeOccurrence({
        seriesId: 1,
        title: 'Community Cleanup',
        organizationId: 'org-1',
        organizationName: 'Community Org',
      }),
      makeOccurrence({
        seriesId: 2,
        title: 'Riverside Potluck',
        organizationId: 'org-2',
        organizationName: 'Other Org',
      }),
    ]);

    renderApp('/');

    // Events from both organizations are listed...
    expect(await screen.findByText('Community Cleanup')).toBeInTheDocument();
    expect(await screen.findByText('Riverside Potluck')).toBeInTheDocument();
    // ...each labeled with its organization, as is the notification.
    expect(screen.getAllByText('Community Org').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Other Org').length).toBeGreaterThanOrEqual(2);
    expect(await screen.findByText('You have been assigned a job')).toBeInTheDocument();
    // The Home page is the only view without an organization filter.
    const url = lastCallUrl(mock, '/api/v1/event-series/occurrences');
    expect(url).toBeDefined();
    expect(new URL(url as string).searchParams.has('organizationId')).toBe(false);
  });
});

describe('CalendarPage', () => {
  it("requests only the active organization's occurrences", async () => {
    mockShellRoutes(mock);
    mock.on('GET', '/api/v1/organizations/org-1/sites/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/rooms/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/teams', {
      items: [],
      total: 0,
      page: 0,
      limit: 200,
    });

    renderApp('/events/calendar');

    await waitFor(() => {
      const url = lastCallUrl(mock, '/api/v1/event-series/occurrences');
      expect(url).toBeDefined();
      expect(new URL(url as string).searchParams.get('organizationId')).toBe('org-1');
    });
  });
});

describe('EventManagementPage', () => {
  it("requests only the active organization's series in the list", async () => {
    mockShellRoutes(mock);
    mock.on('GET', '/api/v1/organizations/org-1/sites/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/rooms/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/teams', {
      items: [],
      total: 0,
      page: 0,
      limit: 200,
    });
    mock.on('GET', '/api/v1/event-series/management', {
      items: [],
      total: 0,
      page: 0,
      limit: 50,
    });

    renderApp('/events/management');

    await waitFor(() => {
      const url = lastCallUrl(mock, '/api/v1/event-series/management');
      expect(url).toBeDefined();
      expect(new URL(url as string).searchParams.get('organizationId')).toBe('org-1');
    });
  });
});

describe('EventConfigPage', () => {
  it('shows the organization of an event', async () => {
    mockShellRoutes(mock);
    mock.on('GET', '/api/v1/event-series/13/management', mockSeries);
    mock.on('GET', '/api/v1/organizations/org-1/sites/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/rooms/all', []);
    mock.on('GET', '/api/v1/organizations/org-1/teams', {
      items: [],
      total: 0,
      page: 0,
      limit: 200,
    });

    renderApp('/events/13');

    expect(await screen.findByRole('heading', { name: 'Summer Festival' })).toBeInTheDocument();
    // The organization label (also present in the navigation) and the
    // organization name of the event (also the active one in the nav bar).
    expect(screen.getAllByText('Organization').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Community Org').length).toBeGreaterThanOrEqual(2);
  });
});
