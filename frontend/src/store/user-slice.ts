import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { authApi, clearToken, usersApi } from '../api/index.js';
import i18n from '../i18n/index.js';
import type { AuthAccount, User, UserListItem, UserPush, UserSelfUpdate } from '../types/index.js';

export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface UserState {
  users: User[];
  userList: UserListItem[];
  currentUser: User | null;
  authAccounts: AuthAccount[];
  authStatus: AuthStatus;
  loading: boolean;
  error: string | null;
}

const initialState: UserState = {
  users: [],
  userList: [],
  currentUser: null,
  authAccounts: [],
  authStatus: 'idle',
  loading: false,
  error: null,
};

export const fetchUsers = createAsyncThunk(
  'user/fetchUsers',
  async (params?: { page?: number; limit?: number }) => {
    return usersApi.getUsers(params);
  },
);

export const fetchUserList = createAsyncThunk('user/fetchUserList', async () => {
  return usersApi.getUserList();
});

export const fetchCurrentUser = createAsyncThunk('user/fetchCurrentUser', async () => {
  return usersApi.getCurrentUser();
});

export const logout = createAsyncThunk('user/logout', async () => {
  try {
    await authApi.logout();
  } catch {
    // Log out locally even when the server call fails.
  }
  clearToken();
});

export const updateUser = createAsyncThunk(
  'user/updateUser',
  async ({ userId, data }: { userId: string; data: UserPush }) => {
    return usersApi.updateUser(userId, data);
  },
);

export const deleteUser = createAsyncThunk('user/deleteUser', async (userId: string) => {
  await usersApi.deleteUser(userId);
  return userId;
});

export const updateCurrentUser = createAsyncThunk(
  'user/updateCurrentUser',
  async (data: UserSelfUpdate) => {
    return usersApi.updateCurrentUser(data);
  },
);

export const deleteCurrentUser = createAsyncThunk('user/deleteCurrentUser', async () => {
  await usersApi.deleteCurrentUser();
  clearToken();
});

export const fetchAuthAccounts = createAsyncThunk('user/fetchAuthAccounts', async () => {
  return usersApi.getAuthAccounts();
});

export const unlinkAuthAccount = createAsyncThunk(
  'user/unlinkAuthAccount',
  async (provider: string) => {
    await usersApi.unlinkAuthAccount(provider);
    return provider;
  },
);

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    clearError: state => {
      state.error = null;
    },
    setCurrentUser: (state, action: PayloadAction<User | null>) => {
      state.currentUser = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchUsers.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;
        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message ?? i18n.t('errors.failedToFetchUsers');
      })
      .addCase(fetchUserList.fulfilled, (state, action) => {
        state.userList = action.payload;
      })
      .addCase(fetchCurrentUser.pending, state => {
        state.authStatus = 'loading';
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.currentUser = action.payload;
        state.authStatus = 'authenticated';
      })
      .addCase(fetchCurrentUser.rejected, state => {
        state.currentUser = null;
        state.authStatus = 'unauthenticated';
      })
      .addCase(logout.fulfilled, state => {
        state.currentUser = null;
        state.authAccounts = [];
        state.authStatus = 'unauthenticated';
      })
      .addCase(updateUser.fulfilled, (state, action) => {
        const index = state.users.findIndex(u => u.id === action.payload.id);
        if (index !== -1) {
          state.users[index] = action.payload;
        }
        if (state.currentUser?.id === action.payload.id) {
          state.currentUser = action.payload;
        }
      })
      .addCase(deleteUser.fulfilled, (state, action) => {
        state.users = state.users.filter(u => u.id !== action.payload);
      })
      .addCase(updateCurrentUser.fulfilled, (state, action) => {
        if (state.currentUser?.id === action.payload.id) {
          state.currentUser = action.payload;
        }
      })
      .addCase(deleteCurrentUser.fulfilled, state => {
        state.currentUser = null;
        state.authAccounts = [];
        state.authStatus = 'unauthenticated';
      })
      .addCase(fetchAuthAccounts.fulfilled, (state, action) => {
        state.authAccounts = action.payload;
      })
      .addCase(unlinkAuthAccount.fulfilled, (state, action) => {
        state.authAccounts = state.authAccounts.filter(
          account => account.provider !== action.payload,
        );
      });
  },
});

export const { clearError, setCurrentUser } = userSlice.actions;
export default userSlice.reducer;
