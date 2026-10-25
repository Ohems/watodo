import { MantineProvider } from '@mantine/core';
import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { organizationsApi, usersApi } from './api/index.js';
import organizationReducer from './store/organization-slice.js';
import userReducer from './store/user-slice.js';
import type { Organization, User } from './types/index.js';

vi.mock('./api/index.js', () => ({
  getToken: () => null,
  setToken: vi.fn(),
  clearToken: vi.fn(),
  usersApi: {
    getUsers: vi.fn(),
    getUserList: vi.fn().mockResolvedValue([]),
    getCurrentUser: vi.fn(),
    getUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
  },
  authApi: {
    getProviders: vi.fn().mockResolvedValue({ providers: [] }),
    loginUrl: vi.fn((provider: string) => `/api/v1/auth/${provider}/login`),
    logout: vi.fn(),
  },
  operationsApi: {
    getOperations: vi.fn(),
    getOperation: vi.fn(),
    upsertOperation: vi.fn(),
    deleteOperation: vi.fn(),
    addAssignment: vi.fn(),
    updateAssignment: vi.fn(),
    deleteAssignment: vi.fn(),
  },
  organizationsApi: {
    getMyOrganizations: vi.fn().mockResolvedValue([]),
    getOrganization: vi.fn(),
    updateOrganization: vi.fn(),
  },
  calendarsApi: {
    getCalendars: vi.fn().mockResolvedValue([]),
    createCalendar: vi.fn(),
  },
  eventsApi: {
    getEventSeries: vi.fn().mockResolvedValue([]),
    getEventSeriesById: vi.fn(),
    createEventSeries: vi.fn(),
    updateEventSeries: vi.fn(),
    deleteEventSeries: vi.fn(),
    getOccurrences: vi.fn().mockResolvedValue([]),
    getSeriesOccurrences: vi.fn().mockResolvedValue([]),
    getOccurrenceDetail: vi.fn(),
    cancelOccurrence: vi.fn(),
    rescheduleOccurrence: vi.fn(),
    deleteException: vi.fn(),
    splitEventSeries: vi.fn(),
    listExceptions: vi.fn().mockResolvedValue([]),
    listJobs: vi.fn().mockResolvedValue([]),
    createJob: vi.fn(),
    updateJob: vi.fn(),
    deleteJob: vi.fn(),
    assignUserToJob: vi.fn(),
    unassignUserFromJob: vi.fn(),
    listComments: vi.fn().mockResolvedValue([]),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
  },
  notificationsApi: {
    listNotifications: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, page: 0, limit: 50, unreadCount: 0 }),
    markRead: vi.fn(),
    markAllRead: vi.fn().mockResolvedValue({ updated: 0 }),
  },
  teamsApi: {
    listTeams: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
    getTeam: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
    listMembers: vi.fn().mockResolvedValue([]),
    addMember: vi.fn(),
    removeMember: vi.fn(),
  },
  sitesApi: {
    listSites: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
    listAllSites: vi.fn().mockResolvedValue([]),
    getSite: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
  },
  roomsApi: {
    listRooms: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
    listAllRooms: vi.fn().mockResolvedValue([]),
    listRoomsBySite: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
    listAllRoomsBySite: vi.fn().mockResolvedValue([]),
    getRoom: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    deleteRoom: vi.fn(),
  },
  jobsApi: {
    listJobs: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
    listAllJobs: vi.fn().mockResolvedValue([]),
    getJob: vi.fn(),
    createJob: vi.fn(),
    updateJob: vi.fn(),
    deleteJob: vi.fn(),
  },
  organizationUsersApi: {
    listUsers: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
  },
  eventManagementApi: {
    listEventSeries: vi.fn().mockResolvedValue({ items: [], total: 0, page: 0, limit: 50 }),
    getEventSeries: vi.fn(),
    updateConfig: vi.fn(),
  },
}));

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

const mockedUsersApi = vi.mocked(usersApi);
const mockedOrganizationsApi = vi.mocked(organizationsApi);

function renderWithProviders(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { user: userReducer, organization: organizationReducer },
  });
  return render(
    <Provider store={store}>
      <MantineProvider>
        <BrowserRouter>{ui}</BrowserRouter>
      </MantineProvider>
    </Provider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, '', '/');
  });

  it('shows the login page when the user is unauthenticated', async () => {
    mockedUsersApi.getCurrentUser.mockRejectedValue(new Error('Not authenticated'));

    renderWithProviders(<App />);

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
  });

  it('renders the app shell once the user is authenticated', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);

    renderWithProviders(<App />);

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    const logos = screen.getAllByAltText('WATODO');
    expect(logos.length).toBeGreaterThan(0);
  });

  it('renders navigation links once the user is authenticated', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);

    renderWithProviders(<App />);

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByText('Home').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Events').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Teams').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Organization').length).toBeGreaterThan(0);
  });

  it('renders the Home page on home route once the user is authenticated', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);

    renderWithProviders(<App />);

    expect(await screen.findByRole('heading', { name: 'Home' })).toBeInTheDocument();
  });

  it('shows the active organization in the navigation bar once authenticated', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);
    mockedOrganizationsApi.getMyOrganizations.mockResolvedValue([mockOrganization]);

    renderWithProviders(<App />);

    expect(
      await screen.findByRole('combobox', { name: 'Select organization' }),
    ).toBeInTheDocument();
    expect((await screen.findAllByText('Community Org')).length).toBeGreaterThan(0);
  });

  it('renders the organization page with the active organization details', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);
    mockedOrganizationsApi.getMyOrganizations.mockResolvedValue([mockOrganization]);
    window.history.pushState({}, '', '/organization');

    renderWithProviders(<App />);

    expect(await screen.findByRole('heading', { name: 'Community Org' })).toBeInTheDocument();
    expect(screen.getByText('A community organization')).toBeInTheDocument();
    expect(screen.getByText('Europe/Helsinki')).toBeInTheDocument();
  });
});
