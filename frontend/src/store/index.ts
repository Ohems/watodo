import { configureStore } from '@reduxjs/toolkit';
import { api } from '../api/index.js';
import organizationReducer from './organization-slice.js';

export const store = configureStore({
  reducer: {
    api: api.reducer,
    organization: organizationReducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware().concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
