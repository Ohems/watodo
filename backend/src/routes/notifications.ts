import type { FastifyInstance } from 'fastify';
import {
  getMailStatusHandler,
  listNotificationPreferencesHandler,
  listNotificationsHandler,
  markAllReadHandler,
  updateNotificationHandler,
  updateNotificationPreferenceHandler,
} from '../controllers/notification-controller.js';
import { requirePermissions } from '../middleware/auth.js';

interface NotificationParams {
  Params: { notificationId: string };
}

interface NotificationPreferenceParams {
  Params: { messageKey: string; channel: string };
}

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/notifications', { preHandler: requirePermissions() }, listNotificationsHandler);

  app.patch<NotificationParams>(
    '/api/v1/notifications/:notificationId',
    { preHandler: requirePermissions() },
    updateNotificationHandler,
  );

  app.post(
    '/api/v1/notifications/mark-all-read',
    { preHandler: requirePermissions() },
    markAllReadHandler,
  );

  // Self-service notification preferences: any authenticated user manages
  // their own preferences, no extra permission required.
  app.get(
    '/api/v1/users/@me/notification-preferences',
    { preHandler: requirePermissions() },
    listNotificationPreferencesHandler,
  );

  app.patch<NotificationPreferenceParams>(
    '/api/v1/users/@me/notification-preferences/:messageKey/:channel',
    { preHandler: requirePermissions() },
    updateNotificationPreferenceHandler,
  );

  // Whether email delivery is configured server-side (shown as a note in the
  // account notification settings when it is not).
  app.get(
    '/api/v1/notifications/mail-status',
    { preHandler: requirePermissions() },
    getMailStatusHandler,
  );
}
