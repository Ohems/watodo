import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type {
  AuthAccount,
  AuthProviderInfo,
  Calendar,
  CalendarPush,
  Certification,
  CertificationPush,
  CertificationUpdate,
  EventComment,
  EventException,
  EventJob,
  EventJobAssignment,
  EventJobPush,
  EventJobUpdate,
  EventOccurrence,
  EventOccurrenceDetail,
  EventSeries,
  EventSeriesConfigUpdate,
  EventSeriesListQuery,
  EventSeriesManagement,
  EventSeriesPush,
  EventSeriesUpdate,
  Notification,
  OccurrenceFilter,
  OpAssignment,
  Operation,
  OperationInput,
  Organization,
  OrganizationUpdate,
  OrganizationUser,
  Paginated,
  PaginatedNotifications,
  Room,
  RoomPush,
  RoomUpdate,
  Site,
  SitePush,
  SiteUpdate,
  TableQuery,
  Team,
  TeamMember,
  TeamPush,
  TeamUpdate,
  User,
  UserCertification,
  UserCertificationPush,
  UserCertificationUpdate,
  UserListItem,
  UserPush,
  UserSelfUpdate,
  UserWorkRole,
  UserWorkRolePush,
  UserWorkRoleUpdate,
  WorkRole,
  WorkRoleDetail,
  WorkRolePush,
  WorkRoleUpdate,
} from '../types/index.js';

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
function withQuery<T extends object>(path: string, params: T): string {
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

function occurrencePath(seriesId: number, occurrenceStart: string): string {
  return `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`;
}

/** Detail cache tag shared by all occurrences of one series. */
function seriesDetailTag(seriesId: number) {
  return { type: 'OccurrenceDetail' as const, id: `series:${seriesId}` };
}

/** Detail cache tag of one specific occurrence. */
function occurrenceDetailTag(seriesId: number, occurrenceStart: string) {
  return { type: 'OccurrenceDetail' as const, id: `${seriesId}:${occurrenceStart}` };
}

/**
 * The frontend API definition. RTK Query caches query results and shares
 * concurrent identical requests, so components that mount twice (React
 * StrictMode double-invoked effects in development) or that need the same
 * data (the current user, the organization list) trigger a single request.
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
    'Operation',
  ],
  endpoints: build => ({
    // --- Auth ---

    getAuthProviders: build.query<{ providers: AuthProviderInfo[] }, void>({
      query: () => '/api/v1/auth/providers',
      providesTags: ['AuthProviders'],
    }),
    logout: build.mutation<void, void>({
      query: () => '/api/v1/auth/logout',
    }),
    /** Starts an OAuth flow that connects the provider to the current account. */
    startLink: build.mutation<
      { authorizationUrl: string },
      { provider: string; returnUrl?: string }
    >({
      query: ({ provider, returnUrl }) => ({
        url: `/api/v1/auth/${provider}/link`,
        method: 'POST',
        body: { returnUrl },
      }),
    }),

    // --- Users ---

    getUsers: build.query<User[], { page?: number; limit?: number; archived?: boolean }>({
      query: query => withQuery('/api/v1/users', query),
      providesTags: ['User'],
    }),
    getUser: build.query<User, string>({
      query: userId => `/api/v1/users/${userId}`,
      providesTags: (_result, _error, userId) => [{ type: 'User', id: userId }],
    }),
    getCurrentUser: build.query<User, void>({
      query: () => '/api/v1/users/@me',
      providesTags: result =>
        result ? ['CurrentUser', { type: 'User', id: result.id }] : ['CurrentUser'],
    }),
    getUserList: build.query<UserListItem[], void>({
      query: () => '/api/v1/users/list',
      providesTags: ['UserList'],
    }),
    updateUser: build.mutation<User, { userId: string; data: UserPush }>({
      query: ({ userId, data }) => ({
        url: `/api/v1/users/${userId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, _error, { userId }) =>
        result ? ['User', { type: 'User', id: userId }] : [],
    }),
    deleteUser: build.mutation<void, string>({
      query: userId => ({ url: `/api/v1/users/${userId}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, userId) => [{ type: 'User', id: userId }, 'User'],
    }),
    updateCurrentUser: build.mutation<User, UserSelfUpdate>({
      query: data => ({ url: '/api/v1/users/@me', method: 'PATCH', body: data }),
      invalidatesTags: result =>
        result ? ['CurrentUser', { type: 'User', id: result.id }] : ['CurrentUser'],
    }),
    deleteCurrentUser: build.mutation<void, void>({
      query: () => ({ url: '/api/v1/users/@me', method: 'DELETE' }),
    }),
    getAuthAccounts: build.query<AuthAccount[], void>({
      query: () => '/api/v1/users/@me/auth-accounts',
      providesTags: ['AuthAccounts'],
    }),
    unlinkAuthAccount: build.mutation<void, string>({
      query: provider => ({ url: `/api/v1/users/@me/auth-accounts/${provider}`, method: 'DELETE' }),
      invalidatesTags: ['AuthAccounts'],
    }),

    // --- Operations ---

    getOperations: build.query<Operation[], void>({
      query: () => '/api/v1/operations',
      providesTags: ['Operation'],
    }),
    getOperation: build.query<Operation, number>({
      query: id => `/api/v1/operations/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Operation', id }],
    }),
    upsertOperation: build.mutation<Operation, OperationInput>({
      query: data => ({ url: '/api/v1/operations', method: 'POST', body: data }),
      invalidatesTags: ['Operation'],
    }),
    deleteOperation: build.mutation<void, number>({
      query: id => ({ url: `/api/v1/operations/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Operation'],
    }),
    addAssignment: build.mutation<
      OpAssignment,
      { operationId: number; data: { name: string; description?: string } }
    >({
      query: ({ operationId, data }) => ({
        url: `/api/v1/operations/${operationId}/assignments`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Operation'],
    }),
    updateAssignment: build.mutation<
      OpAssignment,
      { operationId: number; assignmentId: number; data: { name: string; description?: string } }
    >({
      query: ({ operationId, assignmentId, data }) => ({
        url: `/api/v1/operations/${operationId}/assignments/${assignmentId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Operation'],
    }),
    deleteAssignment: build.mutation<void, { operationId: number; assignmentId: number }>({
      query: ({ operationId, assignmentId }) => ({
        url: `/api/v1/operations/${operationId}/assignments/${assignmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Operation'],
    }),

    // --- Organizations ---

    getMyOrganizations: build.query<Organization[], void>({
      query: () => '/api/v1/organizations',
      providesTags: ['Organization'],
    }),
    getOrganization: build.query<Organization, string>({
      query: organizationId => `/api/v1/organizations/${organizationId}`,
      providesTags: (_result, _error, organizationId) => [
        { type: 'Organization', id: organizationId },
      ],
    }),
    updateOrganization: build.mutation<
      Organization,
      { organizationId: string; data: OrganizationUpdate }
    >({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, _error, { organizationId }) =>
        result ? [{ type: 'Organization', id: organizationId }, 'Organization'] : [],
    }),

    // --- Calendars ---

    getCalendars: build.query<Calendar[], string>({
      query: organizationId => withQuery('/api/v1/calendars', { organizationId }),
      providesTags: ['Calendar'],
    }),
    createCalendar: build.mutation<Calendar, CalendarPush>({
      query: data => ({ url: '/api/v1/calendars', method: 'POST', body: data }),
      invalidatesTags: ['Calendar'],
    }),

    // --- Event series ---

    getEventSeriesList: build.query<EventSeries[], { calendarId?: string; organizationId: string }>(
      {
        query: query => withQuery('/api/v1/event-series', query),
        providesTags: ['EventSeries'],
      },
    ),
    getEventSeriesById: build.query<EventSeries, number>({
      query: seriesId => `/api/v1/event-series/${seriesId}`,
      providesTags: (_result, _error, seriesId) => [{ type: 'EventSeries', id: seriesId }],
    }),
    createEventSeries: build.mutation<EventSeries, EventSeriesPush>({
      query: data => ({ url: '/api/v1/event-series', method: 'POST', body: data }),
      invalidatesTags: ['EventSeries', 'EventSeriesManagement', 'Occurrences'],
    }),
    updateEventSeries: build.mutation<EventSeries, { seriesId: number; data: EventSeriesUpdate }>({
      query: ({ seriesId, data }) => ({
        url: `/api/v1/event-series/${seriesId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result, _error, { seriesId }) =>
        result
          ? [
              { type: 'EventSeries', id: seriesId },
              'EventSeries',
              'EventSeriesManagement',
              'Occurrences',
            ]
          : [],
    }),
    deleteEventSeries: build.mutation<void, number>({
      query: seriesId => ({ url: `/api/v1/event-series/${seriesId}`, method: 'DELETE' }),
      invalidatesTags: ['EventSeries', 'EventSeriesManagement', 'Occurrences'],
    }),

    // --- Occurrences ---

    getOccurrences: build.query<
      EventOccurrence[],
      {
        start: string;
        end: string;
        calendarId?: string;
        organizationId?: string;
        filter?: OccurrenceFilter;
      }
    >({
      query: ({ start, end, calendarId, organizationId, filter }) =>
        withQuery('/api/v1/event-series/occurrences', {
          start,
          end,
          calendarId,
          organizationId,
          scope: filter?.scope,
          siteId: filter?.siteId,
          roomId: filter?.roomId,
          teamId: filter?.teamId,
        }),
      providesTags: ['Occurrences'],
    }),
    getSeriesOccurrences: build.query<
      EventOccurrence[],
      { seriesId: number; start: string; end: string }
    >({
      query: ({ seriesId, start, end }) =>
        withQuery(`/api/v1/event-series/${seriesId}/occurrences`, { start, end }),
      providesTags: ['Occurrences'],
    }),
    getOccurrenceDetail: build.query<
      EventOccurrenceDetail,
      { seriesId: number; occurrenceStart: string }
    >({
      query: ({ seriesId, occurrenceStart }) => occurrencePath(seriesId, occurrenceStart),
      providesTags: (_result, _error, { seriesId, occurrenceStart }) => [
        occurrenceDetailTag(seriesId, occurrenceStart),
        seriesDetailTag(seriesId),
      ],
    }),
    cancelOccurrence: build.mutation<EventException, { seriesId: number; occurrenceStart: string }>(
      {
        query: ({ seriesId, occurrenceStart }) => ({
          url: `${occurrencePath(seriesId, occurrenceStart)}/cancel`,
          method: 'POST',
          body: {},
        }),
        invalidatesTags: (_result, _error, { seriesId, occurrenceStart }) => [
          occurrenceDetailTag(seriesId, occurrenceStart),
          'Occurrences',
        ],
      },
    ),
    rescheduleOccurrence: build.mutation<
      EventException,
      { seriesId: number; occurrenceStart: string; data: { start: string; end?: string } }
    >({
      query: ({ seriesId, occurrenceStart, data }) => ({
        url: `${occurrencePath(seriesId, occurrenceStart)}/reschedule`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId, occurrenceStart }) => [
        occurrenceDetailTag(seriesId, occurrenceStart),
        'Occurrences',
      ],
    }),
    deleteException: build.mutation<void, { seriesId: number; occurrenceStart: string }>({
      query: ({ seriesId, occurrenceStart }) => ({
        url: `${occurrencePath(seriesId, occurrenceStart)}/exception`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId, occurrenceStart }) => [
        occurrenceDetailTag(seriesId, occurrenceStart),
        'Occurrences',
      ],
    }),
    splitEventSeries: build.mutation<
      EventSeries,
      { seriesId: number; occurrenceStart: string; data: EventSeriesUpdate }
    >({
      query: ({ seriesId, occurrenceStart, data }) => ({
        url: `${occurrencePath(seriesId, occurrenceStart)}/split`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId, occurrenceStart }) => [
        occurrenceDetailTag(seriesId, occurrenceStart),
        'Occurrences',
        'EventSeries',
        'EventSeriesManagement',
      ],
    }),
    listExceptions: build.query<EventException[], number>({
      query: seriesId => `/api/v1/event-series/${seriesId}/exceptions`,
      providesTags: (_result, _error, seriesId) => [{ type: 'EventSeries', id: seriesId }],
    }),

    // --- Event jobs ---

    listEventJobs: build.query<EventJob[], { seriesId: number; occurrenceStart?: string }>({
      query: ({ seriesId, occurrenceStart }) =>
        withQuery(`/api/v1/event-series/${seriesId}/jobs`, { occurrenceStart }),
      providesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    createEventJob: build.mutation<EventJob, { seriesId: number; data: EventJobPush }>({
      query: ({ seriesId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/jobs`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    updateEventJob: build.mutation<
      EventJob,
      { seriesId: number; jobId: number; data: EventJobUpdate }
    >({
      query: ({ seriesId, jobId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/jobs/${jobId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    deleteEventJob: build.mutation<void, { seriesId: number; jobId: number }>({
      query: ({ seriesId, jobId }) => ({
        url: `/api/v1/event-series/${seriesId}/jobs/${jobId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    assignUserToJob: build.mutation<
      EventJobAssignment,
      { seriesId: number; jobId: number; userId: string }
    >({
      query: ({ seriesId, jobId, userId }) => ({
        url: `/api/v1/event-series/${seriesId}/jobs/${jobId}/assignments`,
        method: 'POST',
        body: { userId },
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    unassignUserFromJob: build.mutation<
      void,
      { seriesId: number; jobId: number; assignmentId: number }
    >({
      query: ({ seriesId, jobId, assignmentId }) => ({
        url: `/api/v1/event-series/${seriesId}/jobs/${jobId}/assignments/${assignmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),

    // --- Event comments ---

    listEventComments: build.query<EventComment[], { seriesId: number; occurrenceStart?: string }>({
      query: ({ seriesId, occurrenceStart }) =>
        withQuery(`/api/v1/event-series/${seriesId}/comments`, { occurrenceStart }),
      providesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    createEventComment: build.mutation<
      EventComment,
      { seriesId: number; data: { body: string; occurrenceStart?: string | null } }
    >({
      query: ({ seriesId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/comments`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    updateEventComment: build.mutation<
      EventComment,
      { seriesId: number; commentId: number; body: string }
    >({
      query: ({ seriesId, commentId, body }) => ({
        url: `/api/v1/event-series/${seriesId}/comments/${commentId}`,
        method: 'PATCH',
        body: { body },
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    deleteEventComment: build.mutation<void, { seriesId: number; commentId: number }>({
      query: ({ seriesId, commentId }) => ({
        url: `/api/v1/event-series/${seriesId}/comments/${commentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),

    // --- Teams ---

    getTeams: build.query<Paginated<Team>, { organizationId: string; query?: TableQuery }>({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/teams`, query ?? {}),
      providesTags: ['Team'],
    }),
    getTeam: build.query<Team, { organizationId: string; teamId: string }>({
      query: ({ organizationId, teamId }) =>
        `/api/v1/organizations/${organizationId}/teams/${teamId}`,
      providesTags: (_result, _error, { teamId }) => [{ type: 'Team', id: teamId }],
    }),
    createTeam: build.mutation<Team, { organizationId: string; data: TeamPush }>({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/teams`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Team'],
    }),
    updateTeam: build.mutation<Team, { organizationId: string; teamId: string; data: TeamUpdate }>({
      query: ({ organizationId, teamId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/teams/${teamId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Team'],
    }),
    deleteTeam: build.mutation<void, { organizationId: string; teamId: string }>({
      query: ({ organizationId, teamId }) => ({
        url: `/api/v1/organizations/${organizationId}/teams/${teamId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Team'],
    }),
    getTeamMembers: build.query<TeamMember[], { organizationId: string; teamId: string }>({
      query: ({ organizationId, teamId }) =>
        `/api/v1/organizations/${organizationId}/teams/${teamId}/members`,
      providesTags: (_result, _error, { teamId }) => [{ type: 'Team', id: teamId }],
    }),
    addTeamMember: build.mutation<
      TeamMember,
      { organizationId: string; teamId: string; userId: string }
    >({
      query: ({ organizationId, teamId, userId }) => ({
        url: `/api/v1/organizations/${organizationId}/teams/${teamId}/members`,
        method: 'POST',
        body: { userId },
      }),
      invalidatesTags: ['Team'],
    }),
    removeTeamMember: build.mutation<
      void,
      { organizationId: string; teamId: string; userId: string }
    >({
      query: ({ organizationId, teamId, userId }) => ({
        url: `/api/v1/organizations/${organizationId}/teams/${teamId}/members/${userId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Team'],
    }),

    // --- Sites ---

    getSites: build.query<Paginated<Site>, { organizationId: string; query?: TableQuery }>({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/sites`, query ?? {}),
      providesTags: ['Site'],
    }),
    getAllSites: build.query<Site[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/sites/all`,
      providesTags: ['Site'],
    }),
    getSite: build.query<Site, { organizationId: string; siteId: string }>({
      query: ({ organizationId, siteId }) =>
        `/api/v1/organizations/${organizationId}/sites/${siteId}`,
      providesTags: (_result, _error, { siteId }) => [{ type: 'Site', id: siteId }],
    }),
    createSite: build.mutation<Site, { organizationId: string; data: SitePush }>({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Site'],
    }),
    updateSite: build.mutation<Site, { organizationId: string; siteId: string; data: SiteUpdate }>({
      query: ({ organizationId, siteId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Site'],
    }),
    deleteSite: build.mutation<void, { organizationId: string; siteId: string }>({
      query: ({ organizationId, siteId }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Site'],
    }),

    // --- Rooms ---

    getRooms: build.query<
      Paginated<Room>,
      { organizationId: string; query?: TableQuery & { siteId?: string } }
    >({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/rooms`, query ?? {}),
      providesTags: ['Room'],
    }),
    getAllRooms: build.query<Room[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/rooms/all`,
      providesTags: ['Room'],
    }),
    getRoomsBySite: build.query<
      Paginated<Room>,
      { organizationId: string; siteId: string; query?: TableQuery }
    >({
      query: ({ organizationId, siteId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/sites/${siteId}/rooms`, query ?? {}),
      providesTags: ['Room'],
    }),
    getAllRoomsBySite: build.query<Room[], { organizationId: string; siteId: string }>({
      query: ({ organizationId, siteId }) =>
        `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/all`,
      providesTags: ['Room'],
    }),
    getRoom: build.query<Room, { organizationId: string; siteId: string; roomId: string }>({
      query: ({ organizationId, siteId, roomId }) =>
        `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/${roomId}`,
      providesTags: (_result, _error, { roomId }) => [{ type: 'Room', id: roomId }],
    }),
    createRoom: build.mutation<
      Room,
      { organizationId: string; siteId: string; data: Omit<RoomPush, 'siteId' | 'organizationId'> }
    >({
      query: ({ organizationId, siteId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Room'],
    }),
    updateRoom: build.mutation<
      Room,
      { organizationId: string; siteId: string; roomId: string; data: RoomUpdate }
    >({
      query: ({ organizationId, siteId, roomId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/${roomId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Room'],
    }),
    deleteRoom: build.mutation<void, { organizationId: string; siteId: string; roomId: string }>({
      query: ({ organizationId, siteId, roomId }) => ({
        url: `/api/v1/organizations/${organizationId}/sites/${siteId}/rooms/${roomId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Room'],
    }),

    // --- Work Roles ---

    getWorkRoles: build.query<Paginated<WorkRole>, { organizationId: string; query?: TableQuery }>({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/work-roles`, query ?? {}),
      providesTags: ['WorkRole'],
    }),
    getAllWorkRoles: build.query<WorkRole[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/work-roles/all`,
      providesTags: ['WorkRole'],
    }),
    getWorkRole: build.query<WorkRoleDetail, { organizationId: string; workRoleId: number }>({
      query: ({ organizationId, workRoleId }) =>
        `/api/v1/organizations/${organizationId}/work-roles/${workRoleId}`,
      providesTags: (_result, _error, { workRoleId }) => [{ type: 'WorkRole', id: workRoleId }],
    }),
    createWorkRole: build.mutation<WorkRole, { organizationId: string; data: WorkRolePush }>({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/work-roles`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['WorkRole'],
    }),
    updateWorkRole: build.mutation<
      WorkRole,
      { organizationId: string; workRoleId: number; data: WorkRoleUpdate }
    >({
      query: ({ organizationId, workRoleId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/work-roles/${workRoleId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['WorkRole'],
    }),
    deleteWorkRole: build.mutation<void, { organizationId: string; workRoleId: number }>({
      query: ({ organizationId, workRoleId }) => ({
        url: `/api/v1/organizations/${organizationId}/work-roles/${workRoleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['WorkRole'],
    }),
    getWorkRoleUsers: build.query<UserWorkRole[], { organizationId: string; workRoleId: number }>({
      query: ({ organizationId, workRoleId }) =>
        `/api/v1/organizations/${organizationId}/work-roles/${workRoleId}/users`,
      providesTags: ['WorkRole'],
    }),
    addCertificationToWorkRole: build.mutation<
      void,
      { organizationId: string; workRoleId: number; certificationId: number }
    >({
      query: ({ organizationId, workRoleId, certificationId }) => ({
        url: `/api/v1/organizations/${organizationId}/work-roles/${workRoleId}/certifications`,
        method: 'POST',
        body: { certificationId },
      }),
      invalidatesTags: ['WorkRole'],
    }),
    removeCertificationFromWorkRole: build.mutation<
      void,
      { organizationId: string; workRoleId: number; certificationId: number }
    >({
      query: ({ organizationId, workRoleId, certificationId }) => ({
        url: `/api/v1/organizations/${organizationId}/work-roles/${workRoleId}/certifications/${certificationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['WorkRole'],
    }),

    // --- Certifications ---

    getCertifications: build.query<
      Paginated<Certification>,
      { organizationId: string; query?: TableQuery }
    >({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/certifications`, query ?? {}),
      providesTags: ['Certification'],
    }),
    getAllCertifications: build.query<Certification[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/certifications/all`,
      providesTags: ['Certification'],
    }),
    getCertification: build.query<
      Certification,
      { organizationId: string; certificationId: number }
    >({
      query: ({ organizationId, certificationId }) =>
        `/api/v1/organizations/${organizationId}/certifications/${certificationId}`,
      providesTags: (_result, _error, { certificationId }) => [
        { type: 'Certification', id: certificationId },
      ],
    }),
    createCertification: build.mutation<
      Certification,
      { organizationId: string; data: CertificationPush }
    >({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/certifications`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['Certification'],
    }),
    updateCertification: build.mutation<
      Certification,
      { organizationId: string; certificationId: number; data: CertificationUpdate }
    >({
      query: ({ organizationId, certificationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/certifications/${certificationId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Certification'],
    }),
    deleteCertification: build.mutation<void, { organizationId: string; certificationId: number }>({
      query: ({ organizationId, certificationId }) => ({
        url: `/api/v1/organizations/${organizationId}/certifications/${certificationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Certification'],
    }),

    // --- My Work Roles (self-service) ---

    getMyWorkRoles: build.query<UserWorkRole[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/my/work-roles`,
      providesTags: ['UserWorkRole'],
    }),
    addMyWorkRole: build.mutation<UserWorkRole, { organizationId: string; data: UserWorkRolePush }>(
      {
        query: ({ organizationId, data }) => ({
          url: `/api/v1/organizations/${organizationId}/my/work-roles`,
          method: 'POST',
          body: data,
        }),
        invalidatesTags: ['UserWorkRole'],
      },
    ),
    removeMyWorkRole: build.mutation<void, { organizationId: string; userWorkRoleId: number }>({
      query: ({ organizationId, userWorkRoleId }) => ({
        url: `/api/v1/organizations/${organizationId}/my/work-roles/${userWorkRoleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['UserWorkRole'],
    }),

    // --- My Certifications (self-service) ---

    getMyCertifications: build.query<UserCertification[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/my/certifications`,
      providesTags: ['UserCertification'],
    }),
    addMyCertification: build.mutation<
      UserCertification,
      { organizationId: string; data: UserCertificationPush }
    >({
      query: ({ organizationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/my/certifications`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['UserCertification'],
    }),
    removeMyCertification: build.mutation<
      void,
      { organizationId: string; userCertificationId: number }
    >({
      query: ({ organizationId, userCertificationId }) => ({
        url: `/api/v1/organizations/${organizationId}/my/certifications/${userCertificationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['UserCertification'],
    }),
    updateMyCertification: build.mutation<
      UserCertification,
      { organizationId: string; userCertificationId: number; data: UserCertificationUpdate }
    >({
      query: ({ organizationId, userCertificationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/my/certifications/${userCertificationId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['UserCertification'],
    }),

    // --- Admin: user work roles and certifications ---

    getUserWorkRoles: build.query<UserWorkRole[], { organizationId: string; userId: string }>({
      query: ({ organizationId, userId }) =>
        `/api/v1/organizations/${organizationId}/users/${userId}/work-roles`,
      providesTags: ['UserWorkRole'],
    }),
    addUserWorkRole: build.mutation<
      UserWorkRole,
      { organizationId: string; userId: string; data: UserWorkRolePush }
    >({
      query: ({ organizationId, userId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/users/${userId}/work-roles`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['UserWorkRole'],
    }),
    updateUserWorkRole: build.mutation<
      UserWorkRole,
      { organizationId: string; userWorkRoleId: number; data: UserWorkRoleUpdate }
    >({
      query: ({ organizationId, userWorkRoleId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/users/work-roles/${userWorkRoleId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['UserWorkRole'],
    }),
    removeUserWorkRole: build.mutation<void, { organizationId: string; userWorkRoleId: number }>({
      query: ({ organizationId, userWorkRoleId }) => ({
        url: `/api/v1/organizations/${organizationId}/users/work-roles/${userWorkRoleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['UserWorkRole'],
    }),
    getUserCertifications: build.query<
      UserCertification[],
      { organizationId: string; userId: string }
    >({
      query: ({ organizationId, userId }) =>
        `/api/v1/organizations/${organizationId}/users/${userId}/certifications`,
      providesTags: ['UserCertification'],
    }),
    addUserCertification: build.mutation<
      UserCertification,
      { organizationId: string; userId: string; data: UserCertificationPush }
    >({
      query: ({ organizationId, userId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/users/${userId}/certifications`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['UserCertification'],
    }),
    removeUserCertification: build.mutation<
      void,
      { organizationId: string; userCertificationId: number }
    >({
      query: ({ organizationId, userCertificationId }) => ({
        url: `/api/v1/organizations/${organizationId}/users/certifications/${userCertificationId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['UserCertification'],
    }),
    updateUserCertification: build.mutation<
      UserCertification,
      { organizationId: string; userCertificationId: number; data: UserCertificationUpdate }
    >({
      query: ({ organizationId, userCertificationId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/users/certifications/${userCertificationId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['UserCertification'],
    }),

    // --- Notifications ---

    getNotifications: build.query<PaginatedNotifications, TableQuery>({
      query: query => withQuery('/api/v1/notifications', query),
      providesTags: ['Notifications'],
    }),
    markNotificationRead: build.mutation<Notification, { notificationId: number; isRead: boolean }>(
      {
        query: ({ notificationId, isRead }) => ({
          url: `/api/v1/notifications/${notificationId}`,
          method: 'PATCH',
          body: { isRead },
        }),
        invalidatesTags: ['Notifications'],
      },
    ),
    markAllNotificationsRead: build.mutation<{ updated: number }, void>({
      query: () => ({ url: '/api/v1/notifications/mark-all-read', method: 'POST', body: {} }),
      invalidatesTags: ['Notifications'],
    }),

    // --- Organization users ---

    getOrganizationUsers: build.query<
      Paginated<OrganizationUser>,
      { organizationId: string; query?: TableQuery }
    >({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/users`, query ?? {}),
      providesTags: ['OrganizationUsers'],
    }),

    // --- Event series management ---

    getEventSeriesManagementList: build.query<
      Paginated<EventSeriesManagement>,
      EventSeriesListQuery
    >({
      query: query => withQuery('/api/v1/event-series/management', query),
      providesTags: ['EventSeriesManagement'],
    }),
    getEventSeriesManagement: build.query<EventSeriesManagement, number>({
      query: seriesId => `/api/v1/event-series/${seriesId}/management`,
      providesTags: (_result, _error, seriesId) => [
        { type: 'EventSeriesManagement', id: seriesId },
      ],
    }),
    updateEventSeriesConfig: build.mutation<
      EventSeriesManagement,
      { seriesId: number; data: EventSeriesConfigUpdate }
    >({
      query: ({ seriesId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/config`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['EventSeriesManagement'],
    }),
  }),
});

export const {
  useGetAuthProvidersQuery,
  useLogoutMutation,
  useStartLinkMutation,
  useGetUsersQuery,
  useGetUserQuery,
  useGetCurrentUserQuery,
  useGetUserListQuery,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useUpdateCurrentUserMutation,
  useDeleteCurrentUserMutation,
  useGetAuthAccountsQuery,
  useUnlinkAuthAccountMutation,
  useGetOperationsQuery,
  useGetOperationQuery,
  useUpsertOperationMutation,
  useDeleteOperationMutation,
  useAddAssignmentMutation,
  useUpdateAssignmentMutation,
  useDeleteAssignmentMutation,
  useGetMyOrganizationsQuery,
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
  useGetCalendarsQuery,
  useCreateCalendarMutation,
  useGetEventSeriesListQuery,
  useGetEventSeriesByIdQuery,
  useCreateEventSeriesMutation,
  useUpdateEventSeriesMutation,
  useDeleteEventSeriesMutation,
  useGetOccurrencesQuery,
  useGetSeriesOccurrencesQuery,
  useGetOccurrenceDetailQuery,
  useCancelOccurrenceMutation,
  useRescheduleOccurrenceMutation,
  useDeleteExceptionMutation,
  useSplitEventSeriesMutation,
  useListExceptionsQuery,
  useListEventJobsQuery,
  useCreateEventJobMutation,
  useUpdateEventJobMutation,
  useDeleteEventJobMutation,
  useAssignUserToJobMutation,
  useUnassignUserFromJobMutation,
  useListEventCommentsQuery,
  useCreateEventCommentMutation,
  useUpdateEventCommentMutation,
  useDeleteEventCommentMutation,
  useGetTeamsQuery,
  useGetTeamQuery,
  useCreateTeamMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,
  useGetTeamMembersQuery,
  useAddTeamMemberMutation,
  useRemoveTeamMemberMutation,
  useGetSitesQuery,
  useGetAllSitesQuery,
  useGetSiteQuery,
  useCreateSiteMutation,
  useUpdateSiteMutation,
  useDeleteSiteMutation,
  useGetRoomsQuery,
  useGetAllRoomsQuery,
  useGetRoomsBySiteQuery,
  useGetAllRoomsBySiteQuery,
  useGetRoomQuery,
  useCreateRoomMutation,
  useUpdateRoomMutation,
  useDeleteRoomMutation,
  useGetWorkRolesQuery,
  useGetAllWorkRolesQuery,
  useGetWorkRoleQuery,
  useCreateWorkRoleMutation,
  useUpdateWorkRoleMutation,
  useDeleteWorkRoleMutation,
  useGetWorkRoleUsersQuery,
  useAddCertificationToWorkRoleMutation,
  useRemoveCertificationFromWorkRoleMutation,
  useGetCertificationsQuery,
  useGetAllCertificationsQuery,
  useGetCertificationQuery,
  useCreateCertificationMutation,
  useUpdateCertificationMutation,
  useDeleteCertificationMutation,
  useGetMyWorkRolesQuery,
  useAddMyWorkRoleMutation,
  useRemoveMyWorkRoleMutation,
  useGetMyCertificationsQuery,
  useAddMyCertificationMutation,
  useRemoveMyCertificationMutation,
  useUpdateMyCertificationMutation,
  useGetUserWorkRolesQuery,
  useAddUserWorkRoleMutation,
  useUpdateUserWorkRoleMutation,
  useRemoveUserWorkRoleMutation,
  useGetUserCertificationsQuery,
  useAddUserCertificationMutation,
  useRemoveUserCertificationMutation,
  useUpdateUserCertificationMutation,
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetOrganizationUsersQuery,
  useGetEventSeriesManagementListQuery,
  useGetEventSeriesManagementQuery,
  useUpdateEventSeriesConfigMutation,
} = api;
