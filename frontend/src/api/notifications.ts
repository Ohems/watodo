import type { Notification, PaginatedNotifications, TableQuery } from '../types/index.js';
import { api, withQuery } from './base.js';

export const notificationsApi = api.injectEndpoints({
  endpoints: build => ({
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
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
} = notificationsApi;
