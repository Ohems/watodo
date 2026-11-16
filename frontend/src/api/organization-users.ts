import type {
  OrganizationUser,
  Paginated,
  TableQuery,
  UserEventAssignment,
} from '../types/index.js';
import { api, withQuery } from './base.js';

export const organizationUsersApi = api.injectEndpoints({
  endpoints: build => ({
    getOrganizationUsers: build.query<
      Paginated<OrganizationUser>,
      { organizationId: string; query?: TableQuery }
    >({
      query: ({ organizationId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/users`, query ?? {}),
      providesTags: ['OrganizationUsers'],
    }),
    getOrganizationUser: build.query<OrganizationUser, { organizationId: string; userId: string }>({
      query: ({ organizationId, userId }) =>
        `/api/v1/organizations/${organizationId}/users/${userId}`,
      providesTags: (_result, _error, { userId }) => [{ type: 'OrganizationUsers', id: userId }],
    }),
    getUserEventAssignments: build.query<
      Paginated<UserEventAssignment>,
      {
        organizationId: string;
        userId: string;
        query?: { start?: string; end?: string; page?: number; limit?: number };
      }
    >({
      query: ({ organizationId, userId, query }) =>
        withQuery(`/api/v1/organizations/${organizationId}/users/${userId}/event-assignments`, {
          ...query,
        }),
      providesTags: (_result, _error, { userId }) => [
        { type: 'UserEventAssignments' as const, id: userId },
      ],
    }),
  }),
});

export const {
  useGetOrganizationUsersQuery,
  useGetOrganizationUserQuery,
  useGetUserEventAssignmentsQuery,
} = organizationUsersApi;
