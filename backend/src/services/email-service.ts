import type { Kysely, Transaction } from 'kysely';
import { config } from '../config.js';
import type { Database } from '../db/types.js';
import { renderNotificationMessage } from '../i18n/index.js';
import { isNotificationMessageKey } from '../i18n/messages.js';
import { createLogger } from '../logger.js';
import { getConfiguredMailProvider } from './mail-providers/index.js';

const logger = createLogger('email-service');

// Deliberately not imported from notification-service to avoid an import cycle;
// notification-service imports deliverEmailIfEnabled from here.
type DbOrTx = Kysely<Database> | Transaction<Database>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Minimal HTML wrapper for a rendered notification, with a link back to the app. */
function renderEmailHtml(title: string, body: string, appUrl: string): string {
  return (
    '<!doctype html><html><body style="font-family: sans-serif; color: #1a1a1a;">' +
    `<h1 style="font-size: 20px;">${escapeHtml(title)}</h1>` +
    `<p>${escapeHtml(body)}</p>` +
    `<p><a href="${escapeHtml(appUrl)}">Open Watodo</a></p>` +
    '</body></html>'
  );
}

/**
 * Sends a notification as an email when the user opted into the `email` channel
 * for this message key (email is opt-in, like push) and a mail provider is
 * configured (MAIL_PROVIDER + credentials). Subject and body are rendered
 * server-side in the recipient's language from the message catalog. Delivery
 * errors are logged, never thrown: a mail outage must not fail the request that
 * created the notification.
 *
 * Called by the notification service right after a notification row was
 * inserted, so notifications suppressed in-app or stopped by the dedup key are
 * not emailed either.
 */
export async function deliverEmailIfEnabled(
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
    .where('channel', '=', 'email')
    .executeTakeFirst();
  // Email is opt-in: off unless the user explicitly enabled it.
  if (pref ? !pref.enabled : true) return;
  const provider = getConfiguredMailProvider();
  if (!provider) {
    logger.debug('Email delivery skipped: no mail provider configured');
    return;
  }
  const user = await executor
    .selectFrom('users')
    .select(['email', 'language'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user?.email) return;
  const message = renderNotificationMessage(key, params, user.language);
  const appUrl = config.appUrl;
  try {
    await provider.sendMail({
      to: user.email,
      subject: message.title,
      text: `${message.title}\n\n${message.body}\n\n${appUrl}`,
      html: renderEmailHtml(message.title, message.body, appUrl),
    });
  } catch (error) {
    logger.error(
      { err: error, userId, key, provider: provider.id },
      'Failed to send notification email',
    );
  }
}
