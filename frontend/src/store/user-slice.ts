import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { usersApi } from '../api/index.js';
import type { User, UserListItem, UserPush } from '../types/index.js';

interface UserState {
  users: User[];
  userList: UserListItem[];
  currentUser: User | null;
  loading: boolean;
  error: string | null;
}

const initialState: UserState = {
  users: [],
  userList: [],
  currentUser: null,
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
        state.error = action.error.message ?? 'Failed to fetch users';
      })
      .addCase(fetchUserList.fulfilled, (state, action) => {
        state.userList = action.payload;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.currentUser = action.payload;
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
      });
  },
});

export const { clearError, setCurrentUser } = userSlice.actions;
export default userSlice.reducer;
