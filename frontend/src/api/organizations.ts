import type {
  Calendar,
  CalendarPush,
  EventType,
  Organization,
  OrganizationUpdate,
} from '../types/index.js';
import { api, withQuery } from './base.js';

export const organizationsApi = api.injectEndpoints({
  endpoints: build => ({
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

    // --- Event types ---

    getEventTypes: build.query<EventType[], string>({
      query: organizationId => `/api/v1/organizations/${organizationId}/event-types`,
      providesTags: ['EventTypes'],
    }),
  }),
});

export const {
  useGetMyOrganizationsQuery,
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
  useGetCalendarsQuery,
  useCreateCalendarMutation,
  useGetEventTypesQuery,
} = organizationsApi;
