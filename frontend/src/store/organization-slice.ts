import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '../api/index.js';
import type { RootState } from './index.js';
import { deleteCurrentUser, logout } from './session.js';

const ACTIVE_ORGANIZATION_KEY = 'watodo_active_organization';

function loadActiveOrganizationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ORGANIZATION_KEY);
  } catch {
    return null;
  }
}

function persistActiveOrganizationId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_ORGANIZATION_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ORGANIZATION_KEY);
    }
  } catch {
    // Storage can be unavailable (e.g. private mode); the selection is then
    // only kept in memory.
  }
}

interface OrganizationState {
  activeOrganizationId: string | null;
}

const initialState: OrganizationState = {
  activeOrganizationId: loadActiveOrganizationId(),
};

function clearActiveOrganization(state: OrganizationState): void {
  state.activeOrganizationId = null;
  persistActiveOrganizationId(null);
}

const organizationSlice = createSlice({
  name: 'organization',
  initialState,
  reducers: {
    setActiveOrganization: (state, action: PayloadAction<string>) => {
      state.activeOrganizationId = action.payload;
      persistActiveOrganizationId(action.payload);
    },
  },
  extraReducers: builder => {
    builder
      .addCase(logout.fulfilled, clearActiveOrganization)
      .addCase(deleteCurrentUser.fulfilled, clearActiveOrganization);
  },
});

/**
 * The active organization: the persisted selection while the organization
 * list is loading, then the selection when it is still a member organization,
 * otherwise the first one (or null when the user has none).
 */
export function selectActiveOrganizationId(state: RootState): string | null {
  const stored = state.organization.activeOrganizationId;
  const { data } = api.endpoints.getMyOrganizations.select()(state);
  if (data === undefined) return stored;
  return data.some(organization => organization.id === stored) ? stored : (data[0]?.id ?? null);
}

export const { setActiveOrganization } = organizationSlice.actions;
export default organizationSlice.reducer;
