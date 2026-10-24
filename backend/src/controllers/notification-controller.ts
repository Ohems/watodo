import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import { notificationUpdateSchema, tableQuerySchema } from '../schemas/index.js';
import {
  listNotifications,
  markAllRead,
  updateNotification,
} from '../services/notification-service.js';

interface NotificationParams {
  Params: { notificationId: string };
}

export async function listNotificationsHandler(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const query = tableQuerySchema.parse(request.query);
  const result = await listNotifications(auth.user.id, query);
  return reply.status(200).send(result);
}

export async function updateNotificationHandler(
  request: FastifyRequest<NotificationParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const notificationId = Number.parseInt(request.params.notificationId, 10);
  if (Number.isNaN(notificationId)) {
    return reply.status(400).send({ error: 'Invalid notification ID!' });
  }
  const data = notificationUpdateSchema.parse(request.body);
  const notification = await updateNotification(notificationId, auth.user.id, data);
  return reply.status(200).send(notification);
}

export async function markAllReadHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const count = await markAllRead(auth.user.id);
  return reply.status(200).send({ updated: count });
}
