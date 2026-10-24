import type { FastifyInstance } from 'fastify';
import {
  listNotificationsHandler,
  markAllReadHandler,
  updateNotificationHandler,
} from '../controllers/notification-controller.js';
import { requirePermissions } from '../middleware/auth.js';

interface NotificationParams {
  Params: { notificationId: string };
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
}
