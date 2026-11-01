import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { createTestStore } from '../test/test-utils.js';
import type { Organization } from '../types/index.js';
import organizationReducer, {
  selectActiveOrganizationId,
  selectIsOrganizationLoaded,
  setActiveOrganization,
} from './organization-slice.js';
import { deleteCurrentUser, logout } from './session.js';

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
    expect(state.activeOrganizationId).toBeNull();
  });

  it('should persist the active organization when it is set', () => {
    const state = organizationReducer(undefined, setActiveOrganization('org-b'));
    expect(state.activeOrganizationId).toBe('org-b');
    expect(localStorage.getItem('watodo_active_organization')).toBe('org-b');
  });

  it('should restore the persisted active organization as the initial state', async () => {
    localStorage.setItem('watodo_active_organization', 'org-b');
    // The initial state reads localStorage when the module is evaluated, so a
    // fresh module instance simulates a page reload.
    vi.resetModules();
    const { default: freshReducer } = await import('./organization-slice.js');
    const state = freshReducer(undefined, { type: 'unknown' });
    expect(state.activeOrganizationId).toBe('org-b');
  });

  it('should clear the active organization on logout', () => {
    let state = organizationReducer(undefined, setActiveOrganization('org-a'));
    state = organizationReducer(state, logout.fulfilled(undefined, '', undefined));
    expect(state.activeOrganizationId).toBeNull();
    expect(localStorage.getItem('watodo_active_organization')).toBeNull();
  });

  it('should clear the active organization when the account is deleted', () => {
    let state = organizationReducer(undefined, setActiveOrganization('org-a'));
    state = organizationReducer(state, deleteCurrentUser.fulfilled(undefined, '', undefined));
    expect(state.activeOrganizationId).toBeNull();
    expect(localStorage.getItem('watodo_active_organization')).toBeNull();
  });
});

describe('selectActiveOrganizationId', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  async function seedOrganizations(organizations: Organization[]) {
    const store = createTestStore();
    await store.dispatch(api.util.upsertQueryData('getMyOrganizations', undefined, organizations));
    return store;
  }

  it('should return null while the organizations are loading', () => {
    const store = createTestStore();
    store.dispatch(setActiveOrganization('org-b'));
    expect(selectActiveOrganizationId(store.getState())).toBeNull();
  });

  it('should select the first organization when nothing is stored', async () => {
    const store = await seedOrganizations([orgA, orgB]);
    expect(selectActiveOrganizationId(store.getState())).toBe('org-a');
  });

  it('should keep the stored selection when it is still a member organization', async () => {
    const store = await seedOrganizations([orgA, orgB]);
    store.dispatch(setActiveOrganization('org-b'));
    expect(selectActiveOrganizationId(store.getState())).toBe('org-b');
  });

  it('should fall back to the first organization when the selection is gone', async () => {
    const store = await seedOrganizations([orgA]);
    store.dispatch(setActiveOrganization('org-gone'));
    expect(selectActiveOrganizationId(store.getState())).toBe('org-a');
  });

  it('should return null when the user has no organization', async () => {
    const store = await seedOrganizations([]);
    expect(selectActiveOrganizationId(store.getState())).toBeNull();
  });
});

describe('selectIsOrganizationLoaded', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  async function seedOrganizations(organizations: Organization[]) {
    const store = createTestStore();
    await store.dispatch(api.util.upsertQueryData('getMyOrganizations', undefined, organizations));
    return store;
  }

  it('should return false while the organizations are loading', () => {
    const store = createTestStore();
    expect(selectIsOrganizationLoaded(store.getState())).toBe(false);
  });

  it('should return true once the organizations have loaded', async () => {
    const store = await seedOrganizations([orgA]);
    expect(selectIsOrganizationLoaded(store.getState())).toBe(true);
  });

  it('should return true when the user has no organization', async () => {
    const store = await seedOrganizations([]);
    expect(selectIsOrganizationLoaded(store.getState())).toBe(true);
  });
});
