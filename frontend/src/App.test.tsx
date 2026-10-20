import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';
import { authApi, usersApi } from './api/index.js';
import userReducer from './store/user-slice.js';
import type { User } from './types/index.js';

vi.mock('./api/index.js', () => ({
  getToken: () => null,
  setToken: vi.fn(),
  clearToken: vi.fn(),
  usersApi: {
    getUsers: vi.fn(),
    getUserList: vi.fn(),
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
}));

const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
  permissions: ['admin'],
  state: 'active',
  isEmployed: true,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockedUsersApi = vi.mocked(usersApi);
const mockedAuthApi = vi.mocked(authApi);

function renderWithProviders(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { user: userReducer },
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

  it('renders the NavBar with WATODO title once the user is authenticated', async () => {
    mockedUsersApi.getCurrentUser.mockResolvedValue(mockUser);

    renderWithProviders(<App />);

    expect(await screen.findByRole('banner')).toBeInTheDocument();
    const titles = screen.getAllByText('WATODO');
    expect(titles.length).toBeGreaterThan(0);
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
});
