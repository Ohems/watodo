import { configureStore } from '@reduxjs/toolkit';
import organizationReducer from './organization-slice.js';
import userReducer from './user-slice.js';

export const store = configureStore({
  reducer: { user: userReducer, organization: organizationReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
