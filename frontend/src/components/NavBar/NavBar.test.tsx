import { MantineProvider } from '@mantine/core';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { BrowserRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import organizationReducer, { fetchMyOrganizations } from '../../store/organization-slice.js';
import userReducer, { setCurrentUser } from '../../store/user-slice.js';
import type { Organization, User } from '../../types/index.js';
import NavBar from './NavBar.js';

const orgA: Organization = {
  id: 'org-a',
  name: 'Org A',
  description: '',
  defaultTimezone: 'UTC',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const orgB: Organization = {
  id: 'org-b',
  name: 'Org B',
  description: '',
  defaultTimezone: 'Europe/Helsinki',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const mockUser: User = {
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  description: '',
  phoneNumber: null,
  permissions: ['admin'],
  state: 'active',
  isEmployed: true,
  isSuspended: false,
  isBlocked: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

function renderNavBar(organizations: Organization[]) {
  const store = configureStore({
    reducer: { user: userReducer, organization: organizationReducer },
  });
  store.dispatch(setCurrentUser(mockUser));
  store.dispatch(fetchMyOrganizations.fulfilled(organizations, ''));
  render(
    <Provider store={store}>
      <MantineProvider>
        <BrowserRouter>
          <NavBar />
        </BrowserRouter>
      </MantineProvider>
    </Provider>,
  );
  return store;
}

describe('NavBar', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the active organization next to the user name', () => {
    renderNavBar([orgA, orgB]);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    // The selector in the app bar; the mobile menu is aria-hidden while closed
    // (its selector is covered by the mobile menu test below).
    expect(screen.getByRole('combobox', { name: 'Select organization' })).toBeInTheDocument();
    expect(screen.getAllByText('Org A').length).toBeGreaterThan(0);
  });

  it('hides the selector when the user has no organization', () => {
    renderNavBar([]);

    expect(screen.queryByRole('combobox', { name: 'Select organization' })).not.toBeInTheDocument();
  });

  it('activates another organization when selected', async () => {
    const store = renderNavBar([orgA, orgB]);

    fireEvent.click(screen.getByRole('combobox', { name: 'Select organization' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Org B' }));

    expect(store.getState().organization.activeOrganizationId).toBe('org-b');
    expect(localStorage.getItem('watodo_active_organization')).toBe('org-b');
  });

  it('shows the selector at the top of the mobile menu', async () => {
    renderNavBar([orgA, orgB]);

    fireEvent.click(screen.getByRole('button', { name: 'navigation menu' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    // The organization selector renders inside the mobile menu dropdown.
    const selectors = screen.getAllByRole('combobox', { name: 'Select organization' });
    expect(selectors.length).toBeGreaterThan(0);
  });
});
