import type {
  Absence,
  AbsencePush,
  AbsenceUpdate,
  AuthAccount,
  User,
  UserListItem,
  UserPush,
  UserSelfUpdate,
} from '../types/index.js';
import { api, withQuery } from './base.js';

export const usersApi = api.injectEndpoints({
  endpoints: build => ({
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
    getUserList: build.query<UserListItem[], { start?: string; end?: string } | undefined>({
      query: query => withQuery('/api/v1/users/list', query ?? {}),
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

    // --- Absences (self-service, current user) ---

    getMyAbsences: build.query<Absence[], { start?: string; end?: string } | undefined>({
      query: query => withQuery('/api/v1/users/@me/absences', query ?? {}),
      providesTags: ['Absence'],
    }),
    createAbsence: build.mutation<Absence, AbsencePush>({
      query: data => ({ url: '/api/v1/users/@me/absences', method: 'POST', body: data }),
      invalidatesTags: ['Absence', 'UserList', 'Occurrences', 'UserEventAssignments'],
    }),
    updateAbsence: build.mutation<Absence, { absenceId: number; data: AbsenceUpdate }>({
      query: ({ absenceId, data }) => ({
        url: `/api/v1/users/@me/absences/${absenceId}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Absence', 'UserList', 'Occurrences', 'UserEventAssignments'],
    }),
    deleteAbsence: build.mutation<void, number>({
      query: absenceId => ({
        url: `/api/v1/users/@me/absences/${absenceId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Absence', 'UserList'],
    }),
  }),
});

export const {
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
  useGetMyAbsencesQuery,
  useCreateAbsenceMutation,
  useUpdateAbsenceMutation,
  useDeleteAbsenceMutation,
} = usersApi;
