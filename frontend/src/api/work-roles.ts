import type {
  Paginated,
  TableQuery,
  UserWorkRole,
  WorkRole,
  WorkRoleDetail,
  WorkRolePush,
  WorkRoleUpdate,
} from '../types/index.js';
import { api, withQuery } from './base.js';

export const workRolesApi = api.injectEndpoints({
  endpoints: build => ({
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
  }),
});

export const {
  useGetWorkRolesQuery,
  useGetAllWorkRolesQuery,
  useGetWorkRoleQuery,
  useCreateWorkRoleMutation,
  useUpdateWorkRoleMutation,
  useDeleteWorkRoleMutation,
  useGetWorkRoleUsersQuery,
  useAddCertificationToWorkRoleMutation,
  useRemoveCertificationFromWorkRoleMutation,
} = workRolesApi;
