import type {
  Paginated,
  TableQuery,
  Team,
  TeamMember,
  TeamMemberUpdate,
  TeamPush,
  TeamUpdate,
} from '../types/index.js';
import { api, withQuery } from './base.js';

export const teamsApi = api.injectEndpoints({
  endpoints: build => ({
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
      { organizationId: string; teamId: string; userId: string; isManager?: boolean }
    >({
      query: ({ organizationId, teamId, userId, isManager }) => ({
        url: `/api/v1/organizations/${organizationId}/teams/${teamId}/members`,
        method: 'POST',
        body: { userId, isManager },
      }),
      invalidatesTags: ['Team'],
    }),
    updateTeamMember: build.mutation<
      TeamMember,
      { organizationId: string; teamId: string; userId: string; data: TeamMemberUpdate }
    >({
      query: ({ organizationId, teamId, userId, data }) => ({
        url: `/api/v1/organizations/${organizationId}/teams/${teamId}/members/${userId}`,
        method: 'PATCH',
        body: data,
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
  }),
});

export const {
  useGetTeamsQuery,
  useGetTeamQuery,
  useCreateTeamMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,
  useGetTeamMembersQuery,
  useAddTeamMemberMutation,
  useUpdateTeamMemberMutation,
  useRemoveTeamMemberMutation,
} = teamsApi;
