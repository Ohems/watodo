import type { Kysely, Transaction } from 'kysely';
import { db } from '../database.js';
import type { Database, Notification, NotificationChannel } from '../db/types.js';
import { badRequest, notFound } from '../http-error.js';
import {
  configurableNotificationMessageKeys,
  isNotificationMessageKey,
  type NotificationMessageKey,
  notificationMessageKeyCategories,
  notificationMessageParams,
} from '../i18n/messages.js';
import { createLogger } from '../logger.js';
import type { NotificationUpdate, TableQuery } from '../schemas/index.js';
import { deliverPushIfEnabled } from './push-service.js';

const logger = createLogger('notification-service');

type DbOrTx = Kysely<Database> | Transaction<Database>;

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
  'notifications.dedup_key',
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

/** All delivery channels, in display order. */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'push'] as const;

/**
 * The default for a channel when the user has no explicit preference row:
 * in-app and email are on, push (not yet delivered) is off.
 */
export function defaultPreferenceEnabled(channel: string): boolean {
  return channel !== 'push';
}

export interface NotificationPreferenceResponse {
  messageKey: string;
  channel: string;
  enabled: boolean;
  /** Settings category of the message key: 'general' or 'management'. */
  category: string;
}

export interface NotificationPreferencesResponse {
  channels: string[];
  /** Every configurable message key crossed with every channel, in catalog order. */
  preferences: NotificationPreferenceResponse[];
}

/**
 * Lists the notification preferences of a user: every configurable message
 * key of the catalog (all except `welcome`) crossed with every channel, using
 * the stored row when present and the channel default otherwise. Each entry
 * carries the key's settings category so the client can group the toggles.
 */
export async function listNotificationPreferences(
  userId: string,
): Promise<NotificationPreferencesResponse> {
  logger.trace('notificationService.listNotificationPreferences');
  const rows = await db
    .selectFrom('notification_preferences')
    .select(['message_key', 'channel', 'enabled'])
    .where('user_id', '=', userId)
    .execute();
  const stored = new Map(rows.map(row => [`${row.message_key}:${row.channel}`, row.enabled]));
  const preferences: NotificationPreferenceResponse[] = [];
  for (const messageKey of configurableNotificationMessageKeys) {
    for (const channel of NOTIFICATION_CHANNELS) {
      const key = `${messageKey}:${channel}`;
      preferences.push({
        messageKey,
        channel,
        enabled: stored.has(key) ? (stored.get(key) as boolean) : defaultPreferenceEnabled(channel),
        category: notificationMessageKeyCategories[messageKey],
      });
    }
  }
  return { channels: [...NOTIFICATION_CHANNELS], preferences };
}

/**
 * Sets one notification preference of a user (upsert). Only known catalog
 * keys and channels are accepted.
 * @returns The updated preference.
 */
export async function updateNotificationPreference(
  userId: string,
  messageKey: string,
  channel: string,
  enabled: boolean,
): Promise<NotificationPreferenceResponse> {
  logger.trace('notificationService.updateNotificationPreference');
  if (!isNotificationMessageKey(messageKey)) {
    throw badRequest(`Unknown notification message key: ${messageKey}`);
  }
  if (!NOTIFICATION_CHANNELS.includes(channel as (typeof NOTIFICATION_CHANNELS)[number])) {
    throw badRequest(`Unknown notification channel: ${channel}`);
  }
  const channelValue = channel as NotificationChannel;
  const row = await db
    .insertInto('notification_preferences')
    .values({ user_id: userId, message_key: messageKey, channel: channelValue, enabled })
    .onConflict(oc =>
      oc
        .constraint('notification_preferences_user_message_channel_key')
        .doUpdateSet({ enabled, updated_at: new Date() }),
    )
    .returning(['message_key', 'channel', 'enabled'])
    .executeTakeFirstOrThrow();
  return {
    messageKey: row.message_key,
    channel: row.channel,
    enabled: row.enabled,
    category: notificationMessageKeyCategories[messageKey as NotificationMessageKey],
  };
}

/**
 * Whether the user wants the given notification type delivered in-app. The
 * notifications table is the in-app inbox, so a disabled in-app preference
 * suppresses the insert. Email/push delivery (future) checks its own channel.
 */
async function isInAppEnabled(executor: DbOrTx, userId: string, key: string): Promise<boolean> {
  const row = await executor
    .selectFrom('notification_preferences')
    .select('enabled')
    .where('user_id', '=', userId)
    .where('message_key', '=', key)
    .where('channel', '=', 'in_app')
    .executeTakeFirst();
  return row ? row.enabled : defaultPreferenceEnabled('in_app');
}

/**
 * Validates the params against the key's schema and inserts a notification
 * row. The insert is skipped (null returned) when the user disabled this
 * message key for the in-app channel. When `dedupKey` is given, the insert is
 * a no-op if the user already has a notification with the same dedup key
 * (enforced by a unique index), so repeated runs of a scheduled job do not
 * duplicate notifications.
 * @returns The inserted row, or null when suppressed or deduplicated.
 */
async function insertNotification(
  executor: DbOrTx,
  userId: string,
  key: string,
  params: unknown,
  organizationId?: string | null,
  dedupKey?: string,
): Promise<Notification | null> {
  if (!isNotificationMessageKey(key)) {
    throw badRequest(`Unknown notification message key: ${key}`);
  }
  let validatedParams: Record<string, unknown>;
  try {
    validatedParams = notificationMessageParams(key as NotificationMessageKey, params);
  } catch {
    throw badRequest(`Invalid params for notification message key: ${key}`);
  }
  if (!(await isInAppEnabled(executor, userId, key))) {
    logger.debug({ userId, key }, 'Notification suppressed by user preference');
    return null;
  }
  const query = executor
    .insertInto('notifications')
    .values({
      user_id: userId,
      organization_id: organizationId ?? null,
      message_key: key,
      params: validatedParams,
      dedup_key: dedupKey ?? null,
    })
    .returningAll();
  let row: Notification | undefined;
  if (dedupKey) {
    row = await query
      .onConflict(oc => oc.columns(['user_id', 'dedup_key']).doNothing())
      .executeTakeFirst();
  } else {
    row = await query.executeTakeFirstOrThrow();
  }
  if (row) {
    // Push delivery rides on the in-app insert, so notifications suppressed
    // in-app or stopped by the dedup key are not pushed either.
    await deliverPushIfEnabled(executor, userId, key, validatedParams);
  }
  return row ?? null;
}

/**
 * Creates a notification for a user inside a transaction. The message is
 * stored language-neutrally as a catalog key plus params; clients and
 * email/push senders render it in the recipient's language.
 * @returns The inserted row, or null when `dedupKey` was already used by this user.
 */
export async function createNotificationInTx(
  tx: Transaction<Database>,
  userId: string,
  key: string,
  params: unknown = {},
  organizationId?: string | null,
  dedupKey?: string,
): Promise<Notification | null> {
  logger.trace('notificationService.createNotificationInTx');
  return insertNotification(tx, userId, key, params, organizationId, dedupKey);
}

/**
 * Creates a notification for a user. The message is stored language-neutrally
 * as a catalog key plus params; clients and email/push senders render it in
 * the recipient's language.
 * @param userId - The user ID.
 * @param key - The notification message key (see i18n/messages.ts).
 * @param params - The template params, validated against the key's schema.
 * @param organizationId - The organization the notification belongs to, if any.
 * @param dedupKey - Optional idempotency key; when the user already has a
 * notification with this key, nothing is inserted and null is returned.
 * @returns The created notification, or null when the dedup key already exists.
 */
export async function createNotification(
  userId: string,
  key: string,
  params: unknown = {},
  organizationId?: string | null,
  dedupKey?: string,
): Promise<NotificationResponse | null> {
  logger.trace('notificationService.createNotification');
  const notification = await insertNotification(db, userId, key, params, organizationId, dedupKey);
  if (!notification) return null;
  return serializeNotification(await getNotificationRowOrThrow(notification.id, userId));
}
