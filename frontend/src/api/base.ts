import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import i18n from '../i18n/index.js';

const TOKEN_KEY = 'watodo_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Builds the login URL for an OAuth provider (the browser navigates there). */
export function getLoginUrl(provider: string, state?: string, returnUrl?: string): string {
  const params = new URLSearchParams();
  if (state) params.set('state', state);
  if (returnUrl) params.set('returnUrl', returnUrl);
  return `/api/v1/auth/${provider}/login?${params.toString()}`;
}

/** Appends the defined query parameters of an object to a path. */
export function withQuery<T extends object>(path: string, params: T): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      search.set(key, String(value));
    }
  }
  const queryString = search.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/** Extracts a displayable message from an RTK Query error. */
export function getApiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    // fetchBaseQuery reports a failed request (backend down, offline, CORS,
    // timeout, unparseable response) with a non-numeric status instead of an
    // HTTP status code; show a clear message instead of "[object Object]".
    if ('status' in error && typeof (error as { status?: unknown }).status === 'string') {
      return i18n.t('common.serverUnreachable');
    }
    if ('data' in error) {
      const data = (error as { data?: unknown }).data;
      if (data && typeof data === 'object' && 'error' in data) {
        const message = (data as { error?: unknown }).error;
        if (typeof message === 'string' && message) return message;
      }
      if (typeof data === 'string' && data) return data;
      if ('status' in error) {
        return `Request failed: ${(error as { status?: unknown }).status}`;
      }
    }
    if ('message' in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === 'string' && message) return message;
    }
  }
  return String(error);
}

/**
 * The base frontend API. Endpoint modules under this directory extend it via
 * `api.injectEndpoints`. RTK Query caches query results and shares concurrent
 * identical requests, so components that mount twice (React StrictMode
 * double-invoked effects in development) or that need the same data (the
 * current user, the organization list) trigger a single request.
 */
export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    // An absolute base URL is required because fetchBaseQuery builds a Request
    // object, which rejects relative URLs outside the browser.
    baseUrl: window.location.origin,
    prepareHeaders: headers => {
      const token = getToken();
      if (token) headers.set('x-token', token);
      return headers;
    },
  }),
  // Data is fetched on mount and on navigation; refetching on window focus or
  // reconnect would fire requests the app does not need.
  refetchOnFocus: false,
  refetchOnReconnect: false,
  tagTypes: [
    'CurrentUser',
    'User',
    'UserList',
    'AuthAccounts',
    'AuthProviders',
    'Organization',
    'Calendar',
    'EventSeries',
    'Occurrences',
    'OccurrenceDetail',
    'Team',
    'Site',
    'Room',
    'WorkRole',
    'Certification',
    'UserWorkRole',
    'UserCertification',
    'Notifications',
    'OrganizationUsers',
    'EventSeriesManagement',
    'EventTypes',
    'UserEventAssignments',
    'Absence',
  ],
  endpoints: () => ({}),
});
