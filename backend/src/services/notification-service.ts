import { db } from '../database.js';
import type { Notification } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { NotificationUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('notification-service');

export interface NotificationResponse {
  id: number;
  userId: string;
  title: string;
  body: string;
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

function serializeNotification(notification: Notification): NotificationResponse {
  return {
    id: notification.id,
    userId: notification.user_id,
    title: notification.title,
    body: notification.body,
    isRead: notification.is_read,
    createdAt: notification.created_at.toISOString(),
  };
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
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
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
  return serializeNotification(updated);
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
 * Creates a notification for a user.
 * @param userId - The user ID.
 * @param title - The notification title.
 * @param body - The notification body.
 * @returns The created notification.
 */
export async function createNotification(
  userId: string,
  title: string,
  body = '',
): Promise<NotificationResponse> {
  logger.trace('notificationService.createNotification');
  const notification = await db
    .insertInto('notifications')
    .values({ user_id: userId, title, body })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeNotification(notification);
}
