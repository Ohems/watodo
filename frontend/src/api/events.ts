import type {
  AssignmentCandidate,
  BookingConflict,
  EventComment,
  EventException,
  EventInfoSlot,
  EventInfoSlotPush,
  EventInfoSlotUpdate,
  EventOccurrence,
  EventOccurrenceDetail,
  EventSeries,
  EventSeriesConfigUpdate,
  EventSeriesListQuery,
  EventSeriesManagement,
  EventSeriesPush,
  EventSeriesUpdate,
  EventWorkRole,
  EventWorkRoleAssignment,
  EventWorkRolePush,
  EventWorkRoleUpdate,
  OccurrenceFilter,
  Paginated,
} from '../types/index.js';
import { api, withQuery } from './base.js';

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

export const eventsApi = api.injectEndpoints({
  endpoints: build => ({
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
    getOccurrenceDetailByRef: build.query<EventOccurrenceDetail, string>({
      query: occurrenceRef => `/api/v1/event-occurrences/${encodeURIComponent(occurrenceRef)}`,
      // Provide both the occurrence-specific tag and the series tag so that
      // work role slot mutations (which invalidate the series tag) refresh this query.
      providesTags: (result, _error, occurrenceRef) => [
        { type: 'OccurrenceDetail' as const, id: `occ:${occurrenceRef}` },
        ...(result ? [seriesDetailTag(result.series.id)] : []),
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

    // --- Event work role slots ---

    listEventWorkRoles: build.query<
      EventWorkRole[],
      { seriesId: number; occurrenceStart?: string }
    >({
      query: ({ seriesId, occurrenceStart }) =>
        withQuery(`/api/v1/event-series/${seriesId}/work-roles`, { occurrenceStart }),
      providesTags: (_result, _error, { seriesId }) => [seriesDetailTag(seriesId)],
    }),
    createEventWorkRole: build.mutation<
      EventWorkRole,
      { seriesId: number; data: EventWorkRolePush }
    >({
      query: ({ seriesId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/work-roles`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
    }),
    updateEventWorkRole: build.mutation<
      EventWorkRole,
      { seriesId: number; workRoleId: number; data: EventWorkRoleUpdate }
    >({
      query: ({ seriesId, workRoleId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/work-roles/${workRoleId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
    }),
    deleteEventWorkRole: build.mutation<
      void,
      { seriesId: number; workRoleId: number; occurrenceRef?: string }
    >({
      query: ({ seriesId, workRoleId, occurrenceRef }) => ({
        url: withQuery(`/api/v1/event-series/${seriesId}/work-roles/${workRoleId}`, {
          ...(occurrenceRef ? { occurrenceRef } : {}),
        }),
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
    }),
    getAssignmentCandidates: build.query<
      AssignmentCandidate[],
      { seriesId: number; slotId: number; start?: string; end?: string }
    >({
      query: ({ seriesId, slotId, start, end }) =>
        withQuery(`/api/v1/event-series/${seriesId}/work-roles/${slotId}/assignment-candidates`, {
          start,
          end,
        }),
      providesTags: ['UserList'],
    }),
    assignUserToWorkRole: build.mutation<
      EventWorkRoleAssignment,
      { seriesId: number; workRoleId: number; userId: string }
    >({
      query: ({ seriesId, workRoleId, userId }) => ({
        url: `/api/v1/event-series/${seriesId}/work-roles/${workRoleId}/assignments`,
        method: 'POST',
        body: { userId },
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
    }),
    unassignUserFromWorkRole: build.mutation<
      void,
      { seriesId: number; workRoleId: number; assignmentId: number }
    >({
      query: ({ seriesId, workRoleId, assignmentId }) => ({
        url: `/api/v1/event-series/${seriesId}/work-roles/${workRoleId}/assignments/${assignmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
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
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
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
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
    }),
    deleteEventComment: build.mutation<void, { seriesId: number; commentId: number }>({
      query: ({ seriesId, commentId }) => ({
        url: `/api/v1/event-series/${seriesId}/comments/${commentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'UserEventAssignments',
      ],
    }),

    // --- Occurrence-level work role slot import ---

    importParentSlots: build.mutation<EventWorkRole[], string>({
      query: occurrenceRef => ({
        url: `/api/v1/event-occurrences/${encodeURIComponent(occurrenceRef)}/import-slots`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_result, _error, occurrenceRef) => [
        { type: 'OccurrenceDetail' as const, id: `occ:${occurrenceRef}` },
      ],
    }),

    // --- Occurrence materialization + occurrence-scoped resources ---
    // The occurrence page calls materialize when the ref is a tmp key, then
    // uses the numeric eventOccurrenceId for all writes.

    materializeOccurrence: build.mutation<
      { occurrenceId: number; conflicts: BookingConflict[] },
      string
    >({
      query: occurrenceRef => ({
        url: `/api/v1/event-occurrences/${encodeURIComponent(occurrenceRef)}/materialize`,
        method: 'POST',
        body: {},
      }),
    }),
    createOccurrenceWorkRole: build.mutation<
      EventWorkRole,
      { occurrenceId: number; data: EventWorkRolePush }
    >({
      query: ({ occurrenceId, data }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    updateOccurrenceWorkRole: build.mutation<
      EventWorkRole,
      { occurrenceId: number; workRoleId: number; data: EventWorkRoleUpdate }
    >({
      query: ({ occurrenceId, workRoleId, data }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${workRoleId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    deleteOccurrenceWorkRole: build.mutation<void, { occurrenceId: number; workRoleId: number }>({
      query: ({ occurrenceId, workRoleId }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${workRoleId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    assignUserToOccurrenceWorkRole: build.mutation<
      EventWorkRoleAssignment,
      { occurrenceId: number; workRoleId: number; userId: string }
    >({
      query: ({ occurrenceId, workRoleId, userId }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${workRoleId}/assignments`,
        method: 'POST',
        body: { userId },
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    unassignUserFromOccurrenceWorkRole: build.mutation<
      void,
      { occurrenceId: number; workRoleId: number; assignmentId: number }
    >({
      query: ({ occurrenceId, workRoleId, assignmentId }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${workRoleId}/assignments/${assignmentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),

    // --- Occurrence-scoped comments ---

    createOccurrenceComment: build.mutation<EventComment, { occurrenceId: number; body: string }>({
      query: ({ occurrenceId, body }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/comments`,
        method: 'POST',
        body: { body },
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    updateOccurrenceComment: build.mutation<
      EventComment,
      { occurrenceId: number; commentId: number; body: string }
    >({
      query: ({ occurrenceId, commentId, body }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/comments/${commentId}`,
        method: 'PATCH',
        body: { body },
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    deleteOccurrenceComment: build.mutation<void, { occurrenceId: number; commentId: number }>({
      query: ({ occurrenceId, commentId }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/comments/${commentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),

    // --- Event info slots ---

    // Series-level: the info slot template (parent slots). Managed in the
    // series management; occurrence copies are inherited, never added/deleted.
    getEventSeriesInfoSlots: build.query<EventInfoSlot[], number>({
      query: seriesId => `/api/v1/event-series/${seriesId}/info-slots`,
      providesTags: (_result, _error, seriesId) => [seriesDetailTag(seriesId)],
    }),
    createEventInfoSlot: build.mutation<
      EventInfoSlot,
      { seriesId: number; data: EventInfoSlotPush }
    >({
      query: ({ seriesId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/info-slots`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'OccurrenceDetail',
      ],
    }),
    updateEventInfoSlot: build.mutation<
      EventInfoSlot,
      { seriesId: number; infoSlotId: number; data: EventInfoSlotUpdate }
    >({
      query: ({ seriesId, infoSlotId, data }) => ({
        url: `/api/v1/event-series/${seriesId}/info-slots/${infoSlotId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'OccurrenceDetail',
      ],
    }),
    deleteEventInfoSlot: build.mutation<void, { seriesId: number; infoSlotId: number }>({
      query: ({ seriesId, infoSlotId }) => ({
        url: `/api/v1/event-series/${seriesId}/info-slots/${infoSlotId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_result, _error, { seriesId }) => [
        seriesDetailTag(seriesId),
        'OccurrenceDetail',
      ],
    }),
    // Occurrence-level: only the value can be updated.
    updateOccurrenceInfoSlot: build.mutation<
      EventInfoSlot,
      { occurrenceId: number; infoSlotId: number; value: string | null }
    >({
      query: ({ occurrenceId, infoSlotId, value }) => ({
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots/${infoSlotId}`,
        method: 'PATCH',
        body: { value },
      }),
      invalidatesTags: ['OccurrenceDetail'],
    }),
    importParentInfoSlots: build.mutation<EventInfoSlot[], string>({
      query: occurrenceRef => ({
        url: `/api/v1/event-occurrences/${encodeURIComponent(occurrenceRef)}/import-info-slots`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_result, _error, occurrenceRef) => [
        { type: 'OccurrenceDetail' as const, id: `occ:${occurrenceRef}` },
        'OccurrenceDetail',
      ],
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
  useGetEventSeriesListQuery,
  useGetEventSeriesByIdQuery,
  useCreateEventSeriesMutation,
  useUpdateEventSeriesMutation,
  useDeleteEventSeriesMutation,
  useGetOccurrencesQuery,
  useGetSeriesOccurrencesQuery,
  useGetOccurrenceDetailQuery,
  useGetOccurrenceDetailByRefQuery,
  useCancelOccurrenceMutation,
  useRescheduleOccurrenceMutation,
  useDeleteExceptionMutation,
  useSplitEventSeriesMutation,
  useListExceptionsQuery,
  useListEventWorkRolesQuery,
  useCreateEventWorkRoleMutation,
  useUpdateEventWorkRoleMutation,
  useDeleteEventWorkRoleMutation,
  useGetAssignmentCandidatesQuery,
  useAssignUserToWorkRoleMutation,
  useUnassignUserFromWorkRoleMutation,
  useListEventCommentsQuery,
  useCreateEventCommentMutation,
  useUpdateEventCommentMutation,
  useDeleteEventCommentMutation,
  useImportParentSlotsMutation,
  useMaterializeOccurrenceMutation,
  useCreateOccurrenceWorkRoleMutation,
  useUpdateOccurrenceWorkRoleMutation,
  useDeleteOccurrenceWorkRoleMutation,
  useAssignUserToOccurrenceWorkRoleMutation,
  useUnassignUserFromOccurrenceWorkRoleMutation,
  useCreateOccurrenceCommentMutation,
  useUpdateOccurrenceCommentMutation,
  useDeleteOccurrenceCommentMutation,
  useGetEventSeriesInfoSlotsQuery,
  useCreateEventInfoSlotMutation,
  useUpdateEventInfoSlotMutation,
  useDeleteEventInfoSlotMutation,
  useUpdateOccurrenceInfoSlotMutation,
  useImportParentInfoSlotsMutation,
  useGetEventSeriesManagementListQuery,
  useGetEventSeriesManagementQuery,
  useUpdateEventSeriesConfigMutation,
} = eventsApi;
