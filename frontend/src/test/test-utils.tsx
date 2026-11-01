import { MantineProvider } from '@mantine/core';
import { configureStore } from '@reduxjs/toolkit';
import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { api } from '../api/index.js';
import organizationReducer from '../store/organization-slice.js';

export function createTestStore() {
  return configureStore({
    reducer: {
      api: api.reducer,
      organization: organizationReducer,
    },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(api.middleware),
  });
}

export type TestStore = ReturnType<typeof createTestStore>;

interface RenderOptions {
  store?: TestStore;
  route?: string;
  /** Wraps the tree in React.StrictMode (double-invoked effects, like the dev server). */
  strict?: boolean;
}

export function renderWithProviders(ui: React.ReactElement, options: RenderOptions = {}) {
  const store = options.store ?? createTestStore();
  window.history.pushState({}, '', options.route ?? '/');
  const tree = (
    <Provider store={store}>
      <MantineProvider>
        <BrowserRouter>{ui}</BrowserRouter>
      </MantineProvider>
    </Provider>
  );
  return {
    store,
    ...render(options.strict ? <StrictMode>{tree}</StrictMode> : tree),
  };
}
