import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type MockApi, mockApi } from '../test/api-mock.js';
import { createTestStore, renderWithProviders } from '../test/test-utils.js';
import type { User } from '../types/index.js';
import { api, getApiErrorMessage, getLoginUrl, useGetCurrentUserQuery } from './index.js';

const mockUser: User = {
  id: 'u1',
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

function CurrentUserName() {
  const { data } = useGetCurrentUserQuery();
  return <span>{data?.name ?? 'loading'}</span>;
}

describe('api', () => {
  let mock: MockApi;

  beforeEach(() => {
    mock = mockApi();
    localStorage.clear();
  });

  it('fetches a shared query only once, even under StrictMode double effects', async () => {
    mock.on('GET', '/api/v1/users/@me', mockUser);
    const store = createTestStore();

    renderWithProviders(
      <>
        <CurrentUserName />
        <CurrentUserName />
      </>,
      { store, strict: true },
    );

    expect((await screen.findAllByText('Test User')).length).toBeGreaterThan(0);
    expect(mock.callCount('GET', '/api/v1/users/@me')).toBe(1);
  });

  it('serves a remounted subscriber from the cache without refetching', async () => {
    mock.on('GET', '/api/v1/users/@me', mockUser);
    const store = createTestStore();

    const first = renderWithProviders(<CurrentUserName />, { store, strict: true });
    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(mock.callCount('GET', '/api/v1/users/@me')).toBe(1);
    first.unmount();

    renderWithProviders(<CurrentUserName />, { store, strict: true });
    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(mock.callCount('GET', '/api/v1/users/@me')).toBe(1);
  });

  it('refetches the invalidated query after a mutation', async () => {
    let currentUser = mockUser;
    mock.on('GET', '/api/v1/users/@me', () => currentUser);
    mock.on('PATCH', '/api/v1/users/@me', () => {
      currentUser = { ...currentUser, ...(mock.lastBody('PATCH', '/api/v1/users/@me') as object) };
      return currentUser;
    });
    const store = createTestStore();

    renderWithProviders(<CurrentUserName />, { store });
    expect(await screen.findByText('Test User')).toBeInTheDocument();
    expect(mock.callCount('GET', '/api/v1/users/@me')).toBe(1);

    await store.dispatch(api.endpoints.updateCurrentUser.initiate({ name: 'Renamed User' }));

    await waitFor(() => {
      expect(mock.callCount('GET', '/api/v1/users/@me')).toBe(2);
    });
    expect(await screen.findByText('Renamed User')).toBeInTheDocument();
  });

  it('builds login urls with an optional state and return url', () => {
    expect(getLoginUrl('discord')).toBe('/api/v1/auth/discord/login?');
    expect(getLoginUrl('google', 'state-1')).toBe('/api/v1/auth/google/login?state=state-1');
    expect(getLoginUrl('microsoft', undefined, '/account')).toBe(
      `/api/v1/auth/microsoft/login?returnUrl=${encodeURIComponent('/account')}`,
    );
  });

  it('extracts displayable messages from API errors', () => {
    expect(getApiErrorMessage({ status: 400, data: { error: 'Email already in use' } })).toBe(
      'Email already in use',
    );
    expect(getApiErrorMessage({ status: 500, data: 'Internal error' })).toBe('Internal error');
    expect(getApiErrorMessage({ status: 503, data: {} })).toBe('Request failed: 503');
    expect(getApiErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(getApiErrorMessage('plain failure')).toBe('plain failure');
  });
});
