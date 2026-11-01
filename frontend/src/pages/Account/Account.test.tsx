import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getToken, setToken } from '../../api/index.js';
import { type MockApi, mockApi } from '../../test/api-mock.js';
import { renderWithProviders } from '../../test/test-utils.js';
import type { AuthAccount, AuthProviderInfo, User, UserSelfUpdate } from '../../types/index.js';
import AccountPage from './Account.js';

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

interface AccountRoutes {
  currentUser: User;
  authAccounts: AuthAccount[];
  accountDeleted: boolean;
}

/** Registers stateful routes: mutations update the served data. */
function mockAccountRoutes(mock: MockApi, state: AccountRoutes) {
  mock.on(
    'GET',
    '/api/v1/users/@me',
    () => (state.accountDeleted ? { error: 'Unauthorized' } : state.currentUser),
    () => (state.accountDeleted ? 401 : 200),
  );
  mock.on('GET', '/api/v1/auth/providers', { providers: mockProviders });
  mock.on('GET', '/api/v1/users/@me/auth-accounts', () => state.authAccounts);
  mock.on('PATCH', '/api/v1/users/@me', () => {
    const body = mock.lastBody('PATCH', '/api/v1/users/@me') as UserSelfUpdate;
    state.currentUser = {
      ...state.currentUser,
      name: body.name ?? state.currentUser.name,
      email: body.email ?? state.currentUser.email,
      description: body.description ?? state.currentUser.description,
      phoneNumber:
        body.phoneNumber === undefined ? state.currentUser.phoneNumber : body.phoneNumber,
    };
    return state.currentUser;
  });
  mock.on('DELETE', '/api/v1/users/@me', () => {
    state.accountDeleted = true;
  });
}

function renderPage(initialEntry = '/account') {
  return renderWithProviders(<AccountPage />, { route: initialEntry });
}

describe('AccountPage', () => {
  let mock: MockApi;
  let state: AccountRoutes;

  beforeEach(() => {
    mock = mockApi();
    localStorage.clear();
    state = {
      currentUser: mockUser,
      authAccounts: [...mockAuthAccounts],
      accountDeleted: false,
    };
    mockAccountRoutes(mock, state);
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
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Alice Cooper' } });
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+35845123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({
        name: 'Alice Cooper',
        email: 'alice@example.com',
        description: 'About Alice',
        phoneNumber: '+35845123456',
      });
    });
    expect(await screen.findByText('Alice Cooper')).toBeInTheDocument();
  });

  it('clears the phone number when the field is emptied', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(mock.lastBody('PATCH', '/api/v1/users/@me')).toEqual({
        name: 'Alice',
        email: 'alice@example.com',
        description: 'About Alice',
        phoneNumber: null,
      });
    });
  });

  it('shows an error when saving fails', async () => {
    mock.on(
      'PATCH',
      '/api/v1/users/@me',
      { error: 'A user with this email address already exists!' },
      400,
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
    expect(mock.callCount('PATCH', '/api/v1/users/@me')).toBe(0);
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
    expect(mock.callCount('PATCH', '/api/v1/users/@me')).toBe(0);
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
    mock.on('PATCH', '/api/v1/users/@me', { error: 'Validation error' }, 400);
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
    mock.on('POST', '/api/v1/auth/google/link', {
      authorizationUrl: 'https://provider.example/authorize?state=abc',
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Google' }));

    await waitFor(() => {
      expect(mock.lastBody('POST', '/api/v1/auth/google/link')).toEqual({
        returnUrl: '/account',
      });
    });
  });

  it('disconnects a login method', async () => {
    state.authAccounts = [
      ...mockAuthAccounts,
      { provider: 'google', providerAccountId: 'google-1', createdAt: '2026-01-02T00:00:00.000Z' },
    ];
    mock.on('DELETE', '/api/v1/users/@me/auth-accounts/google', () => {
      state.authAccounts = state.authAccounts.filter(account => account.provider !== 'google');
    });
    renderPage();

    const disconnectButtons = await screen.findAllByRole('button', { name: 'Disconnect' });
    expect(disconnectButtons).toHaveLength(2);
    fireEvent.click(disconnectButtons[1]);

    await waitFor(() => {
      expect(mock.callCount('DELETE', '/api/v1/users/@me/auth-accounts/google')).toBe(1);
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
    renderPage('/account?linkError=Already%20connected%20to%20a%20different%20user');

    expect(await screen.findByText('Already connected to a different user')).toBeInTheDocument();
  });

  it('deletes the account after confirmation', async () => {
    setToken('test-token');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    expect(await screen.findByRole('heading', { name: 'Delete account?' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete my account' }));

    await waitFor(() => {
      expect(mock.callCount('DELETE', '/api/v1/users/@me')).toBe(1);
    });
    await waitFor(() => {
      expect(getToken()).toBeNull();
    });
  });

  it('keeps the account when the deletion is cancelled', async () => {
    setToken('test-token');
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(mock.callCount('DELETE', '/api/v1/users/@me')).toBe(0);
    expect(getToken()).toBe('test-token');
  });
});
