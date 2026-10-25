import { createAsyncThunk } from '@reduxjs/toolkit';
import { api, clearToken } from '../api/index.js';
import type { AppDispatch } from './index.js';

/**
 * Logs out on the server (best effort) and clears the local session and the
 * cached API state. Resetting the API state makes the active current-user
 * query refetch without a token, which switches the app to the login screen.
 */
export const logout = createAsyncThunk<void, void, { dispatch: AppDispatch }>(
  'user/logout',
  async (_, { dispatch }) => {
    try {
      await dispatch(api.endpoints.logout.initiate()).unwrap();
    } catch {
      // Log out locally even when the server call fails.
    }
    clearToken();
    dispatch(api.util.resetApiState());
  },
);

/** Deletes the current user's account and clears the local session. */
export const deleteCurrentUser = createAsyncThunk<void, void, { dispatch: AppDispatch }>(
  'user/deleteCurrentUser',
  async (_, { dispatch }) => {
    await dispatch(api.endpoints.deleteCurrentUser.initiate()).unwrap();
    clearToken();
    dispatch(api.util.resetApiState());
  },
);
