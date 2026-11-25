import type { Kysely, Transaction } from 'kysely';
import { sendNotification, setVapidDetails } from 'web-push';
import { config } from '../config.js';
import { db } from '../database.js';
import type { Database, PushSubscriptionRow } from '../db/types.js';
import { notFound } from '../http-error.js';
import { renderNotificationMessage } from '../i18n/index.js';
import { isNotificationMessageKey } from '../i18n/messages.js';
import { createLogger } from '../logger.js';
import type { PushSubscriptionRegister } from '../schemas/index.js';

const logger = createLogger('push-service');

// Deliberately not imported from notification-service to avoid an import cycle;
// notification-service imports deliverPushIfEnabled from here.
type DbOrTx = Kysely<Database> | Transaction<Database>;

export interface PushSubscriptionResponse {
  id: number;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

function serializePushSubscription(
  row: Pick<PushSubscriptionRow, 'id' | 'endpoint' | 'user_agent' | 'created_at'>,
): PushSubscriptionResponse {
  return {
    id: row.id,
    endpoint: row.endpoint,
    userAgent: row.user_agent,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Lists the web push subscriptions (browser/device endpoints) of a user.
 * @param userId - The user ID.
 */
export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionResponse[]> {
  logger.trace('pushService.listPushSubscriptions');
  const rows = await db
    .selectFrom('push_subscriptions')
    .select(['id', 'endpoint', 'user_agent', 'created_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'asc')
    .execute();
  return rows.map(serializePushSubscription);
}

/**
 * Registers a web push subscription for a user. The endpoint is unique across
 * all users, so re-registering the same browser endpoint (e.g. after a
 * logout/login) re-points it at the current user instead of failing.
 * @param userId - The user ID.
 * @param data - The subscription as produced by PushSubscription.toJSON().
 * @returns The stored subscription.
 */
export async function registerPushSubscription(
  userId: string,
  data: PushSubscriptionRegister,
): Promise<PushSubscriptionResponse> {
  logger.trace('pushService.registerPushSubscription');
  const values = {
    user_id: userId,
    endpoint: data.endpoint,
    p256dh: data.keys.p256dh,
    auth: data.keys.auth,
    user_agent: data.userAgent ?? null,
  };
  const row = await db
    .insertInto('push_subscriptions')
    .values(values)
    .onConflict(oc => oc.column('endpoint').doUpdateSet(values))
    .returning(['id', 'endpoint', 'user_agent', 'created_at'])
    .executeTakeFirstOrThrow();
  return serializePushSubscription(row);
}

/**
 * Deletes one of the user's own push subscriptions.
 * @param userId - The user ID (must own the subscription).
 * @param subscriptionId - The subscription ID.
 */
export async function deletePushSubscription(
  userId: string,
  subscriptionId: number,
): Promise<void> {
  logger.trace('pushService.deletePushSubscription');
  const result = await db
    .deleteFrom('push_subscriptions')
    .where('id', '=', subscriptionId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!result.numDeletedRows || Number(result.numDeletedRows) === 0) {
    throw notFound(`Push subscription ${subscriptionId} not found!`);
  }
}

/**
 * Sends a web push notification for the given message to all of the user's
 * registered endpoints, when the user has the `push` channel of this message
 * key enabled (push defaults to off) and VAPID keys are configured. The
 * payload is rendered server-side in the recipient's language. Endpoints that
 * the push service reports as gone (404/410) are removed.
 *
 * Called by the notification service right after a notification row was
 * inserted, so notifications suppressed in-app or stopped by the dedup key are
 * not pushed either.
 */
export async function deliverPushIfEnabled(
  executor: DbOrTx,
  userId: string,
  key: string,
  params: Record<string, unknown>,
): Promise<void> {
  if (!isNotificationMessageKey(key)) return;
  const pref = await executor
    .selectFrom('notification_preferences')
    .select('enabled')
    .where('user_id', '=', userId)
    .where('message_key', '=', key)
    .where('channel', '=', 'push')
    .executeTakeFirst();
  // Push defaults to off until explicitly enabled in the account settings.
  if (pref ? !pref.enabled : true) return;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    logger.debug('Push delivery skipped: VAPID keys not configured');
    return;
  }
  const [user, subscriptions] = await Promise.all([
    executor.selectFrom('users').select('language').where('id', '=', userId).executeTakeFirst(),
    executor
      .selectFrom('push_subscriptions')
      .select(['id', 'endpoint', 'p256dh', 'auth'])
      .where('user_id', '=', userId)
      .execute(),
  ]);
  if (subscriptions.length === 0) return;

  let payload: string;
  try {
    const message = renderNotificationMessage(key, params, user?.language ?? 'en-GB');
    payload = JSON.stringify({
      title: message.title,
      body: message.body,
      icon: '/favicons/android-chrome-192x192.png',
      url: '/',
    });
  } catch (error) {
    logger.error({ err: error, key }, 'Failed to render push notification payload');
    return;
  }
  try {
    setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  } catch (error) {
    logger.error({ err: error }, 'Invalid VAPID configuration, push delivery disabled');
    return;
  }

  for (const subscription of subscriptions) {
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        payload,
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await executor.deleteFrom('push_subscriptions').where('id', '=', subscription.id).execute();
        logger.info(
          { subscriptionId: subscription.id, statusCode },
          'Removed stale push subscription',
        );
      } else {
        logger.error(
          { err: error, subscriptionId: subscription.id },
          'Failed to send push notification',
        );
      }
    }
  }
}
