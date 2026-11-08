import type {
  UserCertification,
  UserCertificationPush,
  UserCertificationUpdate,
  UserWorkRole,
  UserWorkRolePush,
  UserWorkRoleUpdate,
} from '../types/index.js';
import { api } from './base.js';

export const userQualificationsApi = api.injectEndpoints({
  endpoints: build => ({
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
  }),
});

export const {
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
} = userQualificationsApi;
