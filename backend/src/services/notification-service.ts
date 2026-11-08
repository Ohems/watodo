import { db } from '../database.js';
import type { Notification } from '../db/types.js';
import { badRequest, notFound } from '../http-error.js';
import { isNotificationMessageKey, notificationMessageParams } from '../i18n/messages.js';
import { createLogger } from '../logger.js';
import type { NotificationUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('notification-service');

export interface NotificationResponse {
  id: number;
  userId: string;
  organizationId: string | null;
  organizationName: string | null;
  /** Language-neutral message key; rendered per user language by the client. */
  messageKey: string;
  /** Structured params interpolated into the message template. */
  params: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface PaginatedNotifications {
  items: NotificationResponse[];
  total: number;
  page: number;
  limit: number;
  unreadCount: number;
}

type NotificationRow = Notification & { organization_name: string | null };

function serializeNotification(notification: NotificationRow): NotificationResponse {
  return {
    id: notification.id,
    userId: notification.user_id,
    organizationId: notification.organization_id,
    organizationName: notification.organization_name,
    messageKey: notification.message_key,
    params: notification.params,
    isRead: notification.is_read,
    createdAt: notification.created_at.toISOString(),
  };
}

const notificationSelect = [
  'notifications.id',
  'notifications.user_id',
  'notifications.organization_id',
  'organizations.name as organization_name',
  'notifications.message_key',
  'notifications.params',
  'notifications.is_read',
  'notifications.created_at',
] as const;

/** Fetches one notification (with its organization name) owned by the user. */
async function getNotificationRowOrThrow(
  notificationId: number,
  userId: string,
): Promise<NotificationRow> {
  const notification = await db
    .selectFrom('notifications')
    .leftJoin('organizations', 'organizations.id', 'notifications.organization_id')
    .select(notificationSelect)
    .where('notifications.id', '=', notificationId)
    .where('notifications.user_id', '=', userId)
    .executeTakeFirst();
  if (!notification) {
    throw notFound(`Notification ${notificationId} not found!`);
  }
  return notification;
}

/**
 * Lists notifications for a user with pagination.
 * @param userId - The user ID.
 * @param query - Pagination parameters.
 * @returns Paginated notifications.
 */
export async function listNotifications(
  userId: string,
  query: TableQuery = {},
): Promise<PaginatedNotifications> {
  logger.trace('notificationService.listNotifications');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;

  const [rows, countRow, unreadRow] = await Promise.all([
    db
      .selectFrom('notifications')
      .leftJoin('organizations', 'organizations.id', 'notifications.organization_id')
      .select(notificationSelect)
      .where('notifications.user_id', '=', userId)
      .orderBy('notifications.created_at', 'desc')
      .limit(limit)
      .offset(page * limit)
      .execute(),
    db
      .selectFrom('notifications')
      .select(db.fn.countAll().as('count'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow(),
    db
      .selectFrom('notifications')
      .select(db.fn.countAll().as('count'))
      .where('user_id', '=', userId)
      .where('is_read', '=', false)
      .executeTakeFirstOrThrow(),
  ]);

  return {
    items: rows.map(serializeNotification),
    total: Number(countRow.count),
    page,
    limit,
    unreadCount: Number(unreadRow.count),
  };
}

/**
 * Marks a notification as read or unread.
 * @param notificationId - The notification ID.
 * @param userId - The user ID (must own the notification).
 * @param data - The update data.
 * @returns The updated notification.
 */
export async function updateNotification(
  notificationId: number,
  userId: string,
  data: NotificationUpdate,
): Promise<NotificationResponse> {
  logger.trace('notificationService.updateNotification');
  const updated = await db
    .updateTable('notifications')
    .set({
      ...(data.isRead !== undefined ? { is_read: data.isRead } : {}),
    })
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Notification ${notificationId} not found!`);
  }
  return serializeNotification(await getNotificationRowOrThrow(notificationId, userId));
}

/**
 * Marks all notifications of a user as read.
 * @param userId - The user ID.
 * @returns The number of updated notifications.
 */
export async function markAllRead(userId: string): Promise<number> {
  logger.trace('notificationService.markAllRead');
  const result = await db
    .updateTable('notifications')
    .set({ is_read: true })
    .where('user_id', '=', userId)
    .where('is_read', '=', false)
    .executeTakeFirst();
  return Number(result.numUpdatedRows);
}

/**
 * Creates a notification for a user. The message is stored language-neutrally
 * as a catalog key plus params; clients and email/push senders render it in
 * the recipient's language.
 * @param userId - The user ID.
 * @param key - The notification message key (see i18n/messages.ts).
 * @param params - The template params, validated against the key's schema.
 * @param organizationId - The organization the notification belongs to, if any.
 * @returns The created notification.
 */
export async function createNotification(
  userId: string,
  key: string,
  params: unknown = {},
  organizationId?: string,
): Promise<NotificationResponse> {
  logger.trace('notificationService.createNotification');
  if (!isNotificationMessageKey(key)) {
    throw badRequest(`Unknown notification message key: ${key}`);
  }
  let validatedParams: Record<string, unknown>;
  try {
    validatedParams = notificationMessageParams(key, params);
  } catch {
    throw badRequest(`Invalid params for notification message key: ${key}`);
  }
  const notification = await db
    .insertInto('notifications')
    .values({
      user_id: userId,
      organization_id: organizationId ?? null,
      message_key: key,
      params: validatedParams,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeNotification(await getNotificationRowOrThrow(notification.id, userId));
}
