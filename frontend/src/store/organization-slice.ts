import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { organizationsApi } from '../api/index.js';
import i18n from '../i18n/index.js';
import type { Organization, OrganizationUpdate } from '../types/index.js';
import { logout } from './user-slice.js';

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
  organizations: Organization[];
  activeOrganizationId: string | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

const initialState: OrganizationState = {
  organizations: [],
  activeOrganizationId: loadActiveOrganizationId(),
  loaded: false,
  loading: false,
  error: null,
};

export const fetchMyOrganizations = createAsyncThunk(
  'organization/fetchMyOrganizations',
  async () => {
    return organizationsApi.getMyOrganizations();
  },
);

export const updateOrganization = createAsyncThunk(
  'organization/updateOrganization',
  async ({ organizationId, data }: { organizationId: string; data: OrganizationUpdate }) => {
    return organizationsApi.updateOrganization(organizationId, data);
  },
);

/**
 * Keeps exactly one active organization: the persisted selection when it is
 * still a member organization, otherwise the first one.
 */
function selectActiveOrganization(state: OrganizationState): void {
  if (state.organizations.length === 0) {
    if (state.activeOrganizationId !== null) {
      state.activeOrganizationId = null;
      persistActiveOrganizationId(null);
    }
    return;
  }
  const isMember = state.organizations.some(org => org.id === state.activeOrganizationId);
  if (!isMember) {
    state.activeOrganizationId = state.organizations[0].id;
    persistActiveOrganizationId(state.activeOrganizationId);
  }
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
      .addCase(fetchMyOrganizations.pending, state => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyOrganizations.fulfilled, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.organizations = action.payload;
        selectActiveOrganization(state);
      })
      .addCase(fetchMyOrganizations.rejected, (state, action) => {
        state.loading = false;
        state.loaded = true;
        state.error = action.error.message ?? i18n.t('errors.failedToFetchOrganizations');
      })
      .addCase(updateOrganization.fulfilled, (state, action) => {
        const index = state.organizations.findIndex(org => org.id === action.payload.id);
        if (index !== -1) {
          state.organizations[index] = action.payload;
        }
      })
      .addCase(updateOrganization.rejected, (state, action) => {
        state.error = action.error.message ?? i18n.t('errors.failedToUpdateOrganization');
      })
      .addCase(logout.fulfilled, state => {
        state.organizations = [];
        state.activeOrganizationId = null;
        state.loaded = false;
        state.loading = false;
        state.error = null;
        persistActiveOrganizationId(null);
      });
  },
});

export const { setActiveOrganization } = organizationSlice.actions;
export default organizationSlice.reducer;
