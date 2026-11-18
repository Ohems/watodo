import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getAuth } from '../middleware/auth.js';
import {
  notificationPreferenceParamsSchema,
  notificationPreferenceUpdateSchema,
  notificationUpdateSchema,
  tableQuerySchema,
} from '../schemas/index.js';
import {
  getConfiguredMailProvider,
  isSupportedMailProvider,
} from '../services/mail-providers/index.js';
import {
  listNotificationPreferences,
  listNotifications,
  markAllRead,
  updateNotification,
  updateNotificationPreference,
} from '../services/notification-service.js';

interface NotificationParams {
  Params: { notificationId: string };
}

interface NotificationPreferenceParams {
  Params: { messageKey: string; channel: string };
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

/** Lists the current user's notification preferences (all keys x channels). */
export async function listNotificationPreferencesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const result = await listNotificationPreferences(auth.user.id);
  return reply.status(200).send(result);
}

/** Sets one notification preference of the current user. */
export async function updateNotificationPreferenceHandler(
  request: FastifyRequest<NotificationPreferenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const { messageKey, channel } = notificationPreferenceParamsSchema.parse(request.params);
  const data = notificationPreferenceUpdateSchema.parse(request.body);
  const preference = await updateNotificationPreference(
    auth.user.id,
    messageKey,
    channel,
    data.enabled,
  );
  return reply.status(200).send(preference);
}

/**
 * Reports whether email delivery is configured on this server, so the account
 * page can tell users when they will not receive notification emails.
 */
export async function getMailStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const provider = getConfiguredMailProvider();
  const selected = isSupportedMailProvider(config.mailProvider) ? config.mailProvider : null;
  return reply
    .status(200)
    .send({ configured: provider !== null, provider: provider?.id ?? selected });
}
