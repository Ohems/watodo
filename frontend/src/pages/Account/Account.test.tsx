import { MantineProvider } from '@mantine/core';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, usersApi } from '../../api/index.js';
import userReducer, { fetchAuthAccounts, fetchCurrentUser } from '../../store/user-slice.js';
import type { AuthAccount, AuthProviderInfo, User } from '../../types/index.js';
import AccountPage from './Account.js';

vi.mock('../../api/index.js', () => ({
  getToken: () => null,
  setToken: vi.fn(),
  clearToken: vi.fn(),
  authApi: {
    getProviders: vi.fn(),
    loginUrl: vi.fn(),
    logout: vi.fn(),
    startLink: vi.fn(),
  },
  usersApi: {
    getUsers: vi.fn(),
    getUser: vi.fn(),
    getCurrentUser: vi.fn(),
    getUserList: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    updateCurrentUser: vi.fn(),
    deleteCurrentUser: vi.fn(),
    getAuthAccounts: vi.fn(),
    unlinkAuthAccount: vi.fn(),
  },
}));

const mockUser: User = {
  id: 'u1',
  name: 'Alice',
  email: 'alice@example.com',
  description: 'About Alice',
  phoneNumber: '+358401234567',
  permissions: [],
  state: 'active',
  isEmployed: false,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const mockProviders: AuthProviderInfo[] = [
  { id: 'discord', name: 'Discord', configured: true },
  { id: 'google', name: 'Google', configured: true },
  { id: 'microsoft', name: 'Microsoft', configured: true },
];

const mockAuthAccounts: AuthAccount[] = [
  { provider: 'discord', providerAccountId: 'discord-1', createdAt: '2026-01-01T00:00:00.000Z' },
];

function renderPage(authAccounts: AuthAccount[] = mockAuthAccounts, initialEntry = '/account') {
  const store = configureStore({
    reducer: { user: userReducer },
  });
  store.dispatch(fetchCurrentUser.fulfilled(mockUser, '', undefined));
  store.dispatch(fetchAuthAccounts.fulfilled(authAccounts, ''));
  render(
    <Provider store={store}>
      <MantineProvider>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AccountPage />
        </MemoryRouter>
      </MantineProvider>
    </Provider>,
  );
  return store;
}

describe('AccountPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(authApi.getProviders).mockResolvedValue({ providers: mockProviders });
    vi.mocked(usersApi.getAuthAccounts).mockResolvedValue(mockAuthAccounts);
  });

  it('shows the personal information of the current user', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('+358401234567')).toBeInTheDocument();
    expect(screen.getByText('About Alice')).toBeInTheDocument();
  });

  it('saves edited personal information', async () => {
    vi.mocked(usersApi.updateCurrentUser).mockResolvedValue({ ...mockUser, name: 'Alice Cooper' });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice Cooper' } });
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+35845123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(usersApi.updateCurrentUser).toHaveBeenCalledWith({
        name: 'Alice Cooper',
        email: 'alice@example.com',
        description: 'About Alice',
        phoneNumber: '+35845123456',
      });
    });
    expect(await screen.findByText('Alice Cooper')).toBeInTheDocument();
  });

  it('clears the phone number when the field is emptied', async () => {
    vi.mocked(usersApi.updateCurrentUser).mockResolvedValue({ ...mockUser, phoneNumber: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(usersApi.updateCurrentUser).toHaveBeenCalledWith({
        name: 'Alice',
        email: 'alice@example.com',
        description: 'About Alice',
        phoneNumber: null,
      });
    });
  });

  it('shows an error when saving fails', async () => {
    vi.mocked(usersApi.updateCurrentUser).mockRejectedValue(
      new Error('A user with this email address already exists!'),
    );
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('A user with this email address already exists!'),
    ).toBeInTheDocument();
  });

  it('shows a translatable field error and does not save when validation fails', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0401234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Phone number must include the country code (e.g. +358401234567)'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(usersApi.updateCurrentUser).not.toHaveBeenCalled();
    // The form stays in editing mode so the field can be corrected.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows field errors for an empty name and an invalid email', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(usersApi.updateCurrentUser).not.toHaveBeenCalled();
  });

  it('clears the field error when the field is corrected', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '0401234567' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Phone number must include the country code (e.g. +358401234567)'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+35845123456' } });
    expect(
      screen.queryByText('Phone number must include the country code (e.g. +358401234567)'),
    ).not.toBeInTheDocument();
  });

  it('shows the backend error message when a failure slips past the frontend validation', async () => {
    vi.mocked(usersApi.updateCurrentUser).mockRejectedValue(new Error('Validation error'));
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Validation error');
    expect(screen.queryByText('Name is required')).not.toBeInTheDocument();
  });

  it('lists connected login methods and offers to connect the others', async () => {
    renderPage();

    expect(await screen.findByText('Discord')).toBeInTheDocument();
    expect(screen.getByText(/Connected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect Microsoft' })).toBeInTheDocument();
  });

  it('starts the OAuth link flow when connecting a provider', async () => {
    vi.mocked(authApi.startLink).mockResolvedValue({
      authorizationUrl: 'https://provider.example/authorize?state=abc',
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google' }));

    await waitFor(() => {
      expect(authApi.startLink).toHaveBeenCalledWith('google', '/account');
    });
  });

  it('disconnects a login method', async () => {
    const twoAccounts: AuthAccount[] = [
      ...mockAuthAccounts,
      { provider: 'google', providerAccountId: 'google-1', createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    vi.mocked(usersApi.getAuthAccounts).mockResolvedValue(twoAccounts);
    vi.mocked(usersApi.unlinkAuthAccount).mockResolvedValue(undefined);
    renderPage(twoAccounts);

    const disconnectButtons = await screen.findAllByRole('button', { name: 'Disconnect' });
    expect(disconnectButtons).toHaveLength(2);
    fireEvent.click(disconnectButtons[1]);

    await waitFor(() => {
      expect(usersApi.unlinkAuthAccount).toHaveBeenCalledWith('google');
    });
    expect(await screen.findByRole('button', { name: 'Connect Google' })).toBeInTheDocument();
  });

  it('disables disconnecting the last login method', async () => {
    renderPage();

    const disconnect = await screen.findByRole('button', { name: 'Disconnect' });
    expect(disconnect).toBeDisabled();
    expect(screen.getByText('You cannot disconnect your last login method.')).toBeInTheDocument();
  });

  it('shows the link error after a failed connect attempt', async () => {
    renderPage(
      mockAuthAccounts,
      '/account?linkError=Already%20connected%20to%20a%20different%20user',
    );

    expect(await screen.findByText('Already connected to a different user')).toBeInTheDocument();
  });

  it('deletes the account after confirmation', async () => {
    vi.mocked(usersApi.deleteCurrentUser).mockResolvedValue(undefined);
    const store = renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('heading', { name: 'Delete account?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => {
      expect(usersApi.deleteCurrentUser).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(store.getState().user.authStatus).toBe('unauthenticated');
    });
  });

  it('keeps the account when the deletion is cancelled', async () => {
    const store = renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(usersApi.deleteCurrentUser).not.toHaveBeenCalled();
    expect(store.getState().user.authStatus).toBe('authenticated');
  });
});
