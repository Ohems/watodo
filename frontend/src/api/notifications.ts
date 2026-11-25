import type {
  MailStatus,
  Notification,
  NotificationChannel,
  NotificationPreference,
  NotificationPreferencesResponse,
  PaginatedNotifications,
  TableQuery,
} from '../types/index.js';
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
    getNotificationPreferences: build.query<NotificationPreferencesResponse, void>({
      query: () => '/api/v1/users/@me/notification-preferences',
      providesTags: ['NotificationPreferences'],
    }),
    getMailStatus: build.query<MailStatus, void>({
      query: () => '/api/v1/notifications/mail-status',
      providesTags: ['MailStatus'],
    }),
    updateNotificationPreference: build.mutation<
      NotificationPreference,
      { messageKey: string; channel: NotificationChannel; enabled: boolean }
    >({
      query: ({ messageKey, channel, enabled }) => ({
        url: `/api/v1/users/@me/notification-preferences/${encodeURIComponent(messageKey)}/${channel}`,
        method: 'PATCH',
        body: { enabled },
      }),
      invalidatesTags: ['NotificationPreferences'],
    }),
  }),
});

export const {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useGetNotificationPreferencesQuery,
  useGetMailStatusQuery,
  useUpdateNotificationPreferenceMutation,
} = notificationsApi;
