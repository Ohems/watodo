import { beforeEach, describe, expect, it } from 'vitest';
import { api, getToken, setToken } from '../api/index.js';
import { type MockApi, mockApi } from '../test/api-mock.js';
import { createTestStore } from '../test/test-utils.js';
import type { Organization } from '../types/index.js';
import { deleteCurrentUser, logout } from './session.js';

const orgA: Organization = {
  id: 'org-a',
  name: 'Org A',
  description: '',
  defaultTimezone: 'UTC',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('session thunks', () => {
  let mock: MockApi;

  beforeEach(() => {
    mock = mockApi();
    localStorage.clear();
  });

  it('logout calls the server, clears the token and resets the cached API state', async () => {
    setToken('test-token');
    mock.on('GET', '/api/v1/auth/logout', {});
    const store = createTestStore();
    await store.dispatch(api.util.upsertQueryData('getMyOrganizations', undefined, [orgA]));
    expect(api.endpoints.getMyOrganizations.select()(store.getState()).data).toEqual([orgA]);

    await store.dispatch(logout());

    expect(mock.callCount('GET', '/api/v1/auth/logout')).toBe(1);
    expect(getToken()).toBeNull();
    expect(api.endpoints.getMyOrganizations.select()(store.getState()).data).toBeUndefined();
  });

  it('logout still clears the token when the server call fails', async () => {
    setToken('test-token');
    mock.on('GET', '/api/v1/auth/logout', { error: 'Server error' }, 500);
    const store = createTestStore();

    await store.dispatch(logout());

    expect(getToken()).toBeNull();
  });

  it('deleteCurrentUser deletes the account, clears the token and resets the cached API state', async () => {
    setToken('test-token');
    mock.on('DELETE', '/api/v1/users/@me', {});
    const store = createTestStore();
    await store.dispatch(api.util.upsertQueryData('getMyOrganizations', undefined, [orgA]));

    await store.dispatch(deleteCurrentUser());

    expect(mock.callCount('DELETE', '/api/v1/users/@me')).toBe(1);
    expect(getToken()).toBeNull();
    expect(api.endpoints.getMyOrganizations.select()(store.getState()).data).toBeUndefined();
  });

  it('deleteCurrentUser keeps the token when the server call fails', async () => {
    setToken('test-token');
    mock.on('DELETE', '/api/v1/users/@me', { error: 'Server error' }, 500);
    const store = createTestStore();

    const action = await store.dispatch(deleteCurrentUser());

    expect(deleteCurrentUser.rejected.match(action)).toBe(true);
    expect(mock.callCount('DELETE', '/api/v1/users/@me')).toBe(1);
    expect(getToken()).toBe('test-token');
  });
});
