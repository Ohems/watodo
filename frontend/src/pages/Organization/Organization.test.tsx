import { MantineProvider } from '@mantine/core';
import { configureStore } from '@reduxjs/toolkit';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationsApi } from '../../api/index.js';
import organizationReducer from '../../store/organization-slice.js';
import userReducer, { setCurrentUser } from '../../store/user-slice.js';
import type { Organization, User } from '../../types/index.js';
import OrganizationPage from './Organization.js';

vi.mock('../../api/index.js', () => ({
  getToken: () => null,
  setToken: vi.fn(),
  clearToken: vi.fn(),
  organizationsApi: {
    getMyOrganizations: vi.fn(),
    getOrganization: vi.fn(),
    updateOrganization: vi.fn(),
  },
}));

const mockOrganization: Organization = {
  id: 'org-1',
  name: 'Community Org',
  description: 'A community organization',
  defaultTimezone: 'Europe/Helsinki',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function makeUser(permissions: string[]): User {
  return {
    id: 'u1',
    name: 'Alice',
    email: 'alice@example.com',
    description: '',
    phoneNumber: null,
    permissions,
    state: 'active',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
  };
}

function renderPage(permissions: string[]) {
  const store = configureStore({
    reducer: { user: userReducer, organization: organizationReducer },
  });
  store.dispatch(setCurrentUser(makeUser(permissions)));
  render(
    <Provider store={store}>
      <MantineProvider>
        <MemoryRouter>
          <OrganizationPage />
        </MemoryRouter>
      </MantineProvider>
    </Provider>,
  );
  return store;
}

describe('OrganizationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('shows the details of the active organization', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    renderPage(['admin']);

    expect(await screen.findByRole('heading', { name: 'Community Org' })).toBeInTheDocument();
    expect(screen.getByText('A community organization')).toBeInTheDocument();
    expect(screen.getByText('Europe/Helsinki')).toBeInTheDocument();
  });

  it('shows the no-organization page when the user has no organization', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([]);
    renderPage(['admin']);

    expect(await screen.findByText('No Organization')).toBeInTheDocument();
  });

  it('shows the edit button to admins', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    renderPage(['admin']);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('shows the edit button to users with organization:write', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    renderPage(['organization:write']);

    expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });

  it('hides the edit button from users without edit permissions', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    renderPage(['events:read']);

    expect(await screen.findByRole('heading', { name: 'Community Org' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('saves the edited organization', async () => {
    const updated: Organization = { ...mockOrganization, name: 'Renamed Org' };
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    vi.mocked(organizationsApi.updateOrganization).mockResolvedValue(updated);
    renderPage(['admin']);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Renamed Org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(organizationsApi.updateOrganization).toHaveBeenCalledWith('org-1', {
        name: 'Renamed Org',
        description: 'A community organization',
        defaultTimezone: 'Europe/Helsinki',
      });
    });
    expect(await screen.findByRole('heading', { name: 'Renamed Org' })).toBeInTheDocument();
  });

  it('shows a translatable field error and does not save when validation fails', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    renderPage(['admin']);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(organizationsApi.updateOrganization).not.toHaveBeenCalled();
    // The form stays in editing mode so the field can be corrected.
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('shows a field error for an empty default timezone', async () => {
    vi.mocked(organizationsApi.getMyOrganizations).mockResolvedValue([mockOrganization]);
    renderPage(['admin']);

    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Default timezone'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Default timezone is required')).toBeInTheDocument();
    expect(organizationsApi.updateOrganization).not.toHaveBeenCalled();
  });
});
