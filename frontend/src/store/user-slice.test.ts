import { describe, expect, it } from 'vitest';
import type { User } from '../types/index.js';
import userReducer, {
  clearError,
  fetchCurrentUser,
  fetchUserList,
  fetchUsers,
  logout,
  setCurrentUser,
} from './user-slice.js';

const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
  phoneNumber: null,
  permissions: ['operations:read'],
  state: 'active',
  isEmployed: true,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

describe('userSlice', () => {
  it('should return the initial state', () => {
    const state = userReducer(undefined, { type: 'unknown' });
    expect(state.users).toEqual([]);
    expect(state.userList).toEqual([]);
    expect(state.currentUser).toBeNull();
    expect(state.authStatus).toBe('idle');
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should clear error', () => {
    const state = userReducer(
      {
        users: [],
        userList: [],
        currentUser: null,
        authAccounts: [],
        authStatus: 'idle',
        loading: false,
        error: 'Some error',
      },
      clearError(),
    );
    expect(state.error).toBeNull();
  });

  it('should set current user', () => {
    const state = userReducer(
      {
        users: [],
        userList: [],
        currentUser: null,
        authAccounts: [],
        authStatus: 'idle',
        loading: false,
        error: null,
      },
      setCurrentUser(mockUser),
    );
    expect(state.currentUser).toEqual(mockUser);
  });

  it('should handle fetchUsers.pending', () => {
    const state = userReducer(undefined, fetchUsers.pending('', {}));
    expect(state.loading).toBe(true);
  });

  it('should handle fetchUsers.fulfilled', () => {
    const state = userReducer(undefined, fetchUsers.fulfilled([mockUser], '', {}));
    expect(state.loading).toBe(false);
    expect(state.users).toEqual([mockUser]);
  });

  it('should handle fetchUserList.fulfilled', () => {
    const state = userReducer(undefined, fetchUserList.fulfilled([{ id: '1', name: 'Test' }], ''));
    expect(state.userList).toEqual([{ id: '1', name: 'Test' }]);
  });

  it('should mark auth as loading while the current user is being fetched', () => {
    const state = userReducer(undefined, fetchCurrentUser.pending('', undefined));
    expect(state.authStatus).toBe('loading');
  });

  it('should mark auth as authenticated when the current user loads', () => {
    const state = userReducer(undefined, fetchCurrentUser.fulfilled(mockUser, '', undefined));
    expect(state.authStatus).toBe('authenticated');
    expect(state.currentUser).toEqual(mockUser);
  });

  it('should mark auth as unauthenticated when the current user request is rejected', () => {
    const state = userReducer(
      undefined,
      fetchCurrentUser.rejected(new Error('401'), '', undefined),
    );
    expect(state.authStatus).toBe('unauthenticated');
    expect(state.currentUser).toBeNull();
  });

  it('should clear the session on logout', () => {
    const state = userReducer(
      {
        users: [],
        userList: [],
        currentUser: mockUser,
        authAccounts: [],
        authStatus: 'authenticated',
        loading: false,
        error: null,
      },
      logout.fulfilled(undefined, '', undefined),
    );
    expect(state.authStatus).toBe('unauthenticated');
    expect(state.currentUser).toBeNull();
  });
});
