import { configureStore } from '@reduxjs/toolkit';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import App from './App.js';
import userReducer from './store/user-slice.js';

function renderWithProviders(ui: React.ReactElement) {
  const store = configureStore({
    reducer: { user: userReducer },
  });
  return render(
    <Provider store={store}>
      <BrowserRouter>{ui}</BrowserRouter>
    </Provider>,
  );
}

describe('App', () => {
  it('renders the NavBar with WATODO title', () => {
    renderWithProviders(<App />);
    const titles = screen.getAllByText('WATODO');
    expect(titles.length).toBeGreaterThan(0);
  });

  it('renders navigation links', () => {
    renderWithProviders(<App />);
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contacts').length).toBeGreaterThan(0);
  });

  it('renders the Calendar page on home route', () => {
    renderWithProviders(<App />);
    expect(screen.getAllByText('Calendar').length).toBeGreaterThan(0);
  });
});
