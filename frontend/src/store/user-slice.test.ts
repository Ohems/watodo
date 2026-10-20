import { describe, expect, it } from 'vitest';
import type { User } from '../types/index.js';
import userReducer, {
  clearError,
  fetchUserList,
  fetchUsers,
  setCurrentUser,
} from './user-slice.js';

const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
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
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should clear error', () => {
    const state = userReducer(
      { users: [], userList: [], currentUser: null, loading: false, error: 'Some error' },
      clearError(),
    );
    expect(state.error).toBeNull();
  });

  it('should set current user', () => {
    const state = userReducer(
      { users: [], userList: [], currentUser: null, loading: false, error: null },
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
});
