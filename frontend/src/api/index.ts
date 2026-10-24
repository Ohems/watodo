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

interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string | null;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;
  const authToken = token ?? getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authToken) headers['x-token'] = authToken;

  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>(path, { token }),
  post: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: 'POST', body, token }),
  patch: <T>(path: string, body: unknown, token?: string | null) =>
    request<T>(path, { method: 'PATCH', body, token }),
  delete: <T>(path: string, token?: string | null) => request<T>(path, { method: 'DELETE', token }),
};

import type {
  AuthAccount,
  AuthProviderInfo,
  Calendar,
  CalendarPush,
  EventComment,
  EventException,
  EventJob,
  EventJobAssignment,
  EventJobPush,
  EventJobUpdate,
  EventOccurrence,
  EventOccurrenceDetail,
  EventSeries,
  EventSeriesPush,
  EventSeriesUpdate,
  OccurrenceFilter,
  OpAssignment,
  Operation,
  OperationInput,
  Organization,
  OrganizationUpdate,
  User,
  UserListItem,
  UserPush,
  UserSelfUpdate,
} from '../types/index.js';

export const authApi = {
  getProviders: () => api.get<{ providers: AuthProviderInfo[] }>('/api/v1/auth/providers'),
  loginUrl: (provider: string, state?: string, returnUrl?: string) => {
    const params = new URLSearchParams();
    if (state) params.set('state', state);
    if (returnUrl) params.set('returnUrl', returnUrl);
    return `/api/v1/auth/${provider}/login?${params.toString()}`;
  },
  logout: () => api.get('/api/v1/auth/logout'),
  /** Starts an OAuth flow that connects the provider to the current account. */
  startLink: (provider: string, returnUrl?: string) =>
    api.post<{ authorizationUrl: string }>(`/api/v1/auth/${provider}/link`, { returnUrl }),
};

export const usersApi = {
  getUsers: (params?: { page?: number; limit?: number; archived?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.page !== undefined) search.set('page', String(params.page));
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    if (params?.archived !== undefined) search.set('archived', String(params.archived));
    const qs = search.toString();
    return api.get<User[]>(`/api/v1/users${qs ? `?${qs}` : ''}`);
  },
  getUser: (userId: string) => api.get<User>(`/api/v1/users/${userId}`),
  getCurrentUser: () => api.get<User>('/api/v1/users/@me'),
  getUserList: () => api.get<UserListItem[]>('/api/v1/users/list'),
  updateUser: (userId: string, data: UserPush) => api.patch<User>(`/api/v1/users/${userId}`, data),
  deleteUser: (userId: string) => api.delete(`/api/v1/users/${userId}`),
  updateCurrentUser: (data: UserSelfUpdate) => api.patch<User>('/api/v1/users/@me', data),
  deleteCurrentUser: () => api.delete('/api/v1/users/@me'),
  getAuthAccounts: () => api.get<AuthAccount[]>('/api/v1/users/@me/auth-accounts'),
  unlinkAuthAccount: (provider: string) =>
    api.delete(`/api/v1/users/@me/auth-accounts/${provider}`),
};

export const operationsApi = {
  getOperations: () => api.get<Operation[]>('/api/v1/operations'),
  getOperation: (id: number) => api.get<Operation>(`/api/v1/operations/${id}`),
  upsertOperation: (data: OperationInput) => api.post<Operation>('/api/v1/operations', data),
  deleteOperation: (id: number) => api.delete(`/api/v1/operations/${id}`),
  addAssignment: (operationId: number, data: { name: string; description?: string }) =>
    api.post<OpAssignment>(`/api/v1/operations/${operationId}/assignments`, data),
  updateAssignment: (
    operationId: number,
    assignmentId: number,
    data: { name: string; description?: string },
  ) =>
    api.patch<OpAssignment>(`/api/v1/operations/${operationId}/assignments/${assignmentId}`, data),
  deleteAssignment: (operationId: number, assignmentId: number) =>
    api.delete(`/api/v1/operations/${operationId}/assignments/${assignmentId}`),
};

export const organizationsApi = {
  getMyOrganizations: () => api.get<Organization[]>('/api/v1/organizations'),
  getOrganization: (organizationId: string) =>
    api.get<Organization>(`/api/v1/organizations/${organizationId}`),
  updateOrganization: (organizationId: string, data: OrganizationUpdate) =>
    api.patch<Organization>(`/api/v1/organizations/${organizationId}`, data),
};

export const calendarsApi = {
  getCalendars: () => api.get<Calendar[]>('/api/v1/calendars'),
  createCalendar: (data: CalendarPush) => api.post<Calendar>('/api/v1/calendars', data),
};

function occurrencePath(seriesId: number, occurrenceStart: string): string {
  return `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`;
}

export const eventsApi = {
  getEventSeries: (calendarId?: string) =>
    api.get<EventSeries[]>(
      `/api/v1/event-series${calendarId ? `?calendarId=${encodeURIComponent(calendarId)}` : ''}`,
    ),
  getEventSeriesById: (seriesId: number) =>
    api.get<EventSeries>(`/api/v1/event-series/${seriesId}`),
  createEventSeries: (data: EventSeriesPush) => api.post<EventSeries>('/api/v1/event-series', data),
  updateEventSeries: (seriesId: number, data: EventSeriesUpdate) =>
    api.patch<EventSeries>(`/api/v1/event-series/${seriesId}`, data),
  deleteEventSeries: (seriesId: number) => api.delete(`/api/v1/event-series/${seriesId}`),

  getOccurrences: (start: Date, end: Date, calendarId?: string, filter?: OccurrenceFilter) => {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    if (calendarId) params.set('calendarId', calendarId);
    if (filter?.scope) params.set('scope', filter.scope);
    if (filter?.locationId) params.set('locationId', filter.locationId);
    if (filter?.teamId) params.set('teamId', filter.teamId);
    return api.get<EventOccurrence[]>(`/api/v1/event-series/occurrences?${params.toString()}`);
  },
  getSeriesOccurrences: (seriesId: number, start: Date, end: Date) => {
    const params = new URLSearchParams({
      start: start.toISOString(),
      end: end.toISOString(),
    });
    return api.get<EventOccurrence[]>(
      `/api/v1/event-series/${seriesId}/occurrences?${params.toString()}`,
    );
  },
  getOccurrenceDetail: (seriesId: number, occurrenceStart: string) =>
    api.get<EventOccurrenceDetail>(occurrencePath(seriesId, occurrenceStart)),

  cancelOccurrence: (seriesId: number, occurrenceStart: string) =>
    api.post<EventException>(`${occurrencePath(seriesId, occurrenceStart)}/cancel`, {}),
  rescheduleOccurrence: (
    seriesId: number,
    occurrenceStart: string,
    data: { start: string; end?: string },
  ) => api.post<EventException>(`${occurrencePath(seriesId, occurrenceStart)}/reschedule`, data),
  deleteException: (seriesId: number, occurrenceStart: string) =>
    api.delete(`${occurrencePath(seriesId, occurrenceStart)}/exception`),
  splitEventSeries: (seriesId: number, occurrenceStart: string, data: EventSeriesUpdate) =>
    api.post<EventSeries>(`${occurrencePath(seriesId, occurrenceStart)}/split`, data),
  listExceptions: (seriesId: number) =>
    api.get<EventException[]>(`/api/v1/event-series/${seriesId}/exceptions`),

  listJobs: (seriesId: number, occurrenceStart?: string) => {
    const params = new URLSearchParams();
    if (occurrenceStart) params.set('occurrenceStart', occurrenceStart);
    const qs = params.toString();
    return api.get<EventJob[]>(`/api/v1/event-series/${seriesId}/jobs${qs ? `?${qs}` : ''}`);
  },
  createJob: (seriesId: number, data: EventJobPush) =>
    api.post<EventJob>(`/api/v1/event-series/${seriesId}/jobs`, data),
  updateJob: (seriesId: number, jobId: number, data: EventJobUpdate) =>
    api.patch<EventJob>(`/api/v1/event-series/${seriesId}/jobs/${jobId}`, data),
  deleteJob: (seriesId: number, jobId: number) =>
    api.delete(`/api/v1/event-series/${seriesId}/jobs/${jobId}`),
  assignUserToJob: (seriesId: number, jobId: number, userId: string) =>
    api.post<EventJobAssignment>(`/api/v1/event-series/${seriesId}/jobs/${jobId}/assignments`, {
      userId,
    }),
  unassignUserFromJob: (seriesId: number, jobId: number, assignmentId: number) =>
    api.delete(`/api/v1/event-series/${seriesId}/jobs/${jobId}/assignments/${assignmentId}`),

  listComments: (seriesId: number, occurrenceStart?: string) => {
    const params = new URLSearchParams();
    if (occurrenceStart) params.set('occurrenceStart', occurrenceStart);
    const qs = params.toString();
    return api.get<EventComment[]>(
      `/api/v1/event-series/${seriesId}/comments${qs ? `?${qs}` : ''}`,
    );
  },
  createComment: (seriesId: number, data: { body: string; occurrenceStart?: string | null }) =>
    api.post<EventComment>(`/api/v1/event-series/${seriesId}/comments`, data),
  updateComment: (seriesId: number, commentId: number, body: string) =>
    api.patch<EventComment>(`/api/v1/event-series/${seriesId}/comments/${commentId}`, { body }),
  deleteComment: (seriesId: number, commentId: number) =>
    api.delete(`/api/v1/event-series/${seriesId}/comments/${commentId}`),
};

// --- Teams ---

import type {
  Paginated,
  TableQuery,
  Team,
  TeamMember,
  TeamPush,
  TeamUpdate,
} from '../types/index.js';

export const teamsApi = {
  listTeams: (organizationId: string, query?: TableQuery) => {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.search) params.set('search', query.search);
    const qs = params.toString();
    return api.get<Paginated<Team>>(
      `/api/v1/organizations/${organizationId}/teams${qs ? `?${qs}` : ''}`,
    );
  },
  getTeam: (organizationId: string, teamId: string) =>
    api.get<Team>(`/api/v1/organizations/${organizationId}/teams/${teamId}`),
  createTeam: (organizationId: string, data: TeamPush) =>
    api.post<Team>(`/api/v1/organizations/${organizationId}/teams`, data),
  updateTeam: (organizationId: string, teamId: string, data: TeamUpdate) =>
    api.patch<Team>(`/api/v1/organizations/${organizationId}/teams/${teamId}`, data),
  deleteTeam: (organizationId: string, teamId: string) =>
    api.delete(`/api/v1/organizations/${organizationId}/teams/${teamId}`),
  listMembers: (organizationId: string, teamId: string) =>
    api.get<TeamMember[]>(`/api/v1/organizations/${organizationId}/teams/${teamId}/members`),
  addMember: (organizationId: string, teamId: string, userId: string) =>
    api.post<TeamMember>(`/api/v1/organizations/${organizationId}/teams/${teamId}/members`, {
      userId,
    }),
  removeMember: (organizationId: string, teamId: string, userId: string) =>
    api.delete(`/api/v1/organizations/${organizationId}/teams/${teamId}/members/${userId}`),
};

// --- Locations ---

import type { Location, LocationPush, LocationUpdate } from '../types/index.js';

export const locationsApi = {
  listLocations: (organizationId: string, query?: TableQuery) => {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.search) params.set('search', query.search);
    const qs = params.toString();
    return api.get<Paginated<Location>>(
      `/api/v1/organizations/${organizationId}/locations${qs ? `?${qs}` : ''}`,
    );
  },
  listAllLocations: (organizationId: string) =>
    api.get<Location[]>(`/api/v1/organizations/${organizationId}/locations/all`),
  getLocation: (organizationId: string, locationId: string) =>
    api.get<Location>(`/api/v1/organizations/${organizationId}/locations/${locationId}`),
  createLocation: (organizationId: string, data: LocationPush) =>
    api.post<Location>(`/api/v1/organizations/${organizationId}/locations`, data),
  updateLocation: (organizationId: string, locationId: string, data: LocationUpdate) =>
    api.patch<Location>(`/api/v1/organizations/${organizationId}/locations/${locationId}`, data),
  deleteLocation: (organizationId: string, locationId: string) =>
    api.delete(`/api/v1/organizations/${organizationId}/locations/${locationId}`),
};

// --- Jobs ---

import type { Job, JobPush, JobUpdate } from '../types/index.js';

export const jobsApi = {
  listJobs: (organizationId: string, query?: TableQuery) => {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.search) params.set('search', query.search);
    const qs = params.toString();
    return api.get<Paginated<Job>>(
      `/api/v1/organizations/${organizationId}/jobs${qs ? `?${qs}` : ''}`,
    );
  },
  listAllJobs: (organizationId: string) =>
    api.get<Job[]>(`/api/v1/organizations/${organizationId}/jobs/all`),
  getJob: (organizationId: string, jobId: number) =>
    api.get<Job>(`/api/v1/organizations/${organizationId}/jobs/${jobId}`),
  createJob: (organizationId: string, data: JobPush) =>
    api.post<Job>(`/api/v1/organizations/${organizationId}/jobs`, data),
  updateJob: (organizationId: string, jobId: number, data: JobUpdate) =>
    api.patch<Job>(`/api/v1/organizations/${organizationId}/jobs/${jobId}`, data),
  deleteJob: (organizationId: string, jobId: number) =>
    api.delete(`/api/v1/organizations/${organizationId}/jobs/${jobId}`),
};

// --- Notifications ---

import type { Notification, PaginatedNotifications } from '../types/index.js';

export const notificationsApi = {
  listNotifications: (query?: TableQuery) => {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    const qs = params.toString();
    return api.get<PaginatedNotifications>(`/api/v1/notifications${qs ? `?${qs}` : ''}`);
  },
  markRead: (notificationId: number, isRead: boolean) =>
    api.patch<Notification>(`/api/v1/notifications/${notificationId}`, { isRead }),
  markAllRead: () => api.post<{ updated: number }>('/api/v1/notifications/mark-all-read', {}),
};

// --- Organization users ---

import type { OrganizationUser } from '../types/index.js';

export const organizationUsersApi = {
  listUsers: (organizationId: string, query?: TableQuery) => {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.search) params.set('search', query.search);
    const qs = params.toString();
    return api.get<Paginated<OrganizationUser>>(
      `/api/v1/organizations/${organizationId}/users${qs ? `?${qs}` : ''}`,
    );
  },
};

// --- Event series management ---

import type {
  EventSeriesConfigUpdate,
  EventSeriesListQuery,
  EventSeriesManagement,
} from '../types/index.js';

export const eventManagementApi = {
  listEventSeries: (query?: EventSeriesListQuery) => {
    const params = new URLSearchParams();
    if (query?.page !== undefined) params.set('page', String(query.page));
    if (query?.limit !== undefined) params.set('limit', String(query.limit));
    if (query?.search) params.set('search', query.search);
    if (query?.startFrom) params.set('startFrom', query.startFrom);
    if (query?.startTo) params.set('startTo', query.startTo);
    if (query?.locationId) params.set('locationId', query.locationId);
    if (query?.teamId) params.set('teamId', query.teamId);
    if (query?.hasTeam !== undefined) params.set('hasTeam', String(query.hasTeam));
    const qs = params.toString();
    return api.get<Paginated<EventSeriesManagement>>(
      `/api/v1/event-series/management${qs ? `?${qs}` : ''}`,
    );
  },
  getEventSeries: (seriesId: number) =>
    api.get<EventSeriesManagement>(`/api/v1/event-series/${seriesId}/management`),
  updateConfig: (seriesId: number, data: EventSeriesConfigUpdate) =>
    api.patch<EventSeriesManagement>(`/api/v1/event-series/${seriesId}/config`, data),
};
