import { MantineProvider } from '@mantine/core';
import { render, screen, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.js';
import { api, clearToken } from './api/index.js';
import { store } from './store/index.js';
import { type MockApi, mockApi } from './test/api-mock.js';
import type { EventSeriesManagement, Organization, User } from './types/index.js';

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

describe('App', () => {
  let mock: MockApi;

  beforeEach(() => {
    mock = mockApi();
    localStorage.clear();
    clearToken();
    store.dispatch(api.util.resetApiState());
    window.history.pushState({}, '', '/');
  });

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
