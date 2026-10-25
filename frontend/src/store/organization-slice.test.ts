import { beforeEach, describe, expect, it } from 'vitest';
import type { Organization } from '../types/index.js';
import organizationReducer, {
  fetchMyOrganizations,
  setActiveOrganization,
  updateOrganization,
} from './organization-slice.js';
import { logout } from './user-slice.js';

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
  description: 'Second organization',
  defaultTimezone: 'Europe/Helsinki',
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('organizationSlice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should return the initial state', () => {
    const state = organizationReducer(undefined, { type: 'unknown' });
    expect(state.organizations).toEqual([]);
    expect(state.activeOrganizationId).toBeNull();
    expect(state.loaded).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should activate the first organization when the list loads', () => {
    const state = organizationReducer(undefined, fetchMyOrganizations.fulfilled([orgA, orgB], ''));
    expect(state.organizations).toEqual([orgA, orgB]);
    expect(state.activeOrganizationId).toBe('org-a');
    expect(state.loaded).toBe(true);
    expect(localStorage.getItem('watodo_active_organization')).toBe('org-a');
  });

  it('should keep the selected organization when it is still a member organization', () => {
    let state = organizationReducer(undefined, setActiveOrganization('org-b'));
    state = organizationReducer(state, fetchMyOrganizations.fulfilled([orgA, orgB], ''));
    expect(state.activeOrganizationId).toBe('org-b');
  });

  it('should fall back to the first organization when the selection is gone', () => {
    let state = organizationReducer(undefined, setActiveOrganization('org-gone'));
    state = organizationReducer(state, fetchMyOrganizations.fulfilled([orgA], ''));
    expect(state.activeOrganizationId).toBe('org-a');
  });

  it('should clear the active organization when the user has none', () => {
    let state = organizationReducer(undefined, fetchMyOrganizations.fulfilled([orgA], ''));
    state = organizationReducer(state, fetchMyOrganizations.fulfilled([], ''));
    expect(state.organizations).toEqual([]);
    expect(state.activeOrganizationId).toBeNull();
    expect(localStorage.getItem('watodo_active_organization')).toBeNull();
  });

  it('should replace the organization after an update', () => {
    const updated: Organization = { ...orgA, name: 'Renamed Org' };
    let state = organizationReducer(undefined, fetchMyOrganizations.fulfilled([orgA, orgB], ''));
    state = organizationReducer(
      state,
      updateOrganization.fulfilled(updated, '', {
        organizationId: orgA.id,
        data: { name: 'Renamed Org' },
      }),
    );
    expect(state.organizations[0].name).toBe('Renamed Org');
    expect(state.organizations[1]).toEqual(orgB);
  });

  it('should clear the organizations on logout', () => {
    let state = organizationReducer(undefined, fetchMyOrganizations.fulfilled([orgA], ''));
    state = organizationReducer(state, logout.fulfilled(undefined, '', undefined));
    expect(state.organizations).toEqual([]);
    expect(state.activeOrganizationId).toBeNull();
    expect(state.loaded).toBe(false);
    expect(localStorage.getItem('watodo_active_organization')).toBeNull();
  });
});
