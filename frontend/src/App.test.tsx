import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { authApi, organizationsApi, usersApi } from './api/index.js';
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
    getProviders: vi.fn(),
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
const mockedAuthApi = vi.mocked(authApi);
const mockedOrganizationsApi = vi.mocked(organizationsApi);

function renderWithProviders(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { user: userReducer, organization: organizationReducer },
  });
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('greets an unauthorized user with the login screen', async () => {
    mockedUsersApi.getCurrentUser.mockRejectedValue(new Error('Request failed: 401'));
    mockedAuthApi.getProviders.mockResolvedValue({
      providers: [
        { id: 'discord', name: 'Discord', configured: true },
        { id: 'google', name: 'Google', configured: false },
      ],
    });

    renderWithProviders(<App />);

    expect(await screen.findByText('Sign in to continue')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Sign in with Discord' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
  });

  it('falls back to the built-in provider list when providers cannot be fetched', async () => {
    mockedUsersApi.getCurrentUser.mockRejectedValue(new Error('Request failed: 401'));
    mockedAuthApi.getProviders.mockRejectedValue(new Error('Network error'));

    renderWithProviders(<App />);

    expect(await screen.findByRole('link', { name: 'Sign in with Discord' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in with Microsoft' })).toBeInTheDocument();
  });

  it('renders the NavBar with WATODO logo once the user is authenticated', async () => {
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
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contacts').length).toBeGreaterThan(0);
  });

  it('renders the Calendar page on home route once the user is authenticated', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);

    renderWithProviders(<App />);

    expect(await screen.findByRole('heading', { name: 'Calendar' })).toBeInTheDocument();
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
