import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { api } from '../../api/index.js';
import { type MockApi, mockApi } from '../../test/api-mock.js';
import { renderWithProviders } from '../../test/test-utils.js';
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

describe('NavBar', () => {
  let mock: MockApi;

  beforeEach(() => {
    mock = mockApi();
    localStorage.clear();
    mock.on('GET', '/api/v1/users/@me', mockUser);
  });

  it('shows the active organization next to the user name', async () => {
    mock.on('GET', '/api/v1/organizations', [orgA, orgB]);

    renderWithProviders(<NavBar />);

    expect(await screen.findByText('Test User')).toBeInTheDocument();
    // The selector in the app bar; the mobile menu is aria-hidden while closed
    // (its selector is covered by the mobile menu test below).
    expect(screen.getByRole('combobox', { name: 'Select organization' })).toBeInTheDocument();
    expect(screen.getAllByText('Org A').length).toBeGreaterThan(0);
  });

  it('hides the selector when the user has no organization', async () => {
    mock.on('GET', '/api/v1/organizations', []);

    const { store } = renderWithProviders(<NavBar />);

    expect(await screen.findByText('Test User')).toBeInTheDocument();
    await waitFor(() => {
      expect(api.endpoints.getMyOrganizations.select()(store.getState()).isSuccess).toBe(true);
    });
    expect(screen.queryByRole('combobox', { name: 'Select organization' })).not.toBeInTheDocument();
  });

  it('activates another organization when selected', async () => {
    mock.on('GET', '/api/v1/organizations', [orgA, orgB]);

    const { store } = renderWithProviders(<NavBar />);

    fireEvent.click(await screen.findByRole('combobox', { name: 'Select organization' }));
    // jsdom has no layout, so Mantine keeps the floating dropdown hidden;
    // the options are still in the accessibility tree with `hidden: true`.
    fireEvent.click(await screen.findByRole('option', { name: 'Org B', hidden: true }));

    expect(store.getState().organization.activeOrganizationId).toBe('org-b');
    expect(localStorage.getItem('watodo_active_organization')).toBe('org-b');
  });

  it('shows the selector at the top of the mobile menu', async () => {
    mock.on('GET', '/api/v1/organizations', [orgA, orgB]);

    renderWithProviders(<NavBar />);

    fireEvent.click(await screen.findByRole('button', { name: 'navigation menu' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    // The organization selector renders inside the mobile menu dropdown.
    const selectors = screen.getAllByRole('combobox', { name: 'Select organization' });
    expect(selectors.length).toBeGreaterThan(0);
  });
});
