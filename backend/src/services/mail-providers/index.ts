import { config } from '../../config.js';
import { createLogger } from '../../logger.js';
import { mailgunProvider } from './mailgun.js';
import { resendProvider } from './resend.js';
import { smtpProvider } from './smtp.js';
import type { MailProviderDefinition } from './types.js';
import { usesendProvider } from './usesend.js';

const logger = createLogger('mail-providers');

export const SUPPORTED_MAIL_PROVIDERS = ['resend', 'mailgun', 'usesend', 'smtp'] as const;

export type MailProviderId = (typeof SUPPORTED_MAIL_PROVIDERS)[number];

/**
 * Adding a provider means adding a file in this directory and registering it
 * here. The Record key set is checked against the MailProviderId union at
 * compile time.
 */
const providers: Record<MailProviderId, MailProviderDefinition> = {
  resend: resendProvider,
  mailgun: mailgunProvider,
  usesend: usesendProvider,
  smtp: smtpProvider,
};

export function isSupportedMailProvider(id: string): id is MailProviderId {
  return (SUPPORTED_MAIL_PROVIDERS as readonly string[]).includes(id);
}

export function getMailProvider(id: MailProviderId): MailProviderDefinition {
  return providers[id];
}

/**
 * The mail provider selected with MAIL_PROVIDER, or null when none is selected
 * or the selected one is not fully configured (email delivery disabled).
 */
export function getConfiguredMailProvider(): MailProviderDefinition | null {
  const id = config.mailProvider;
  if (!id) return null;
  if (!isSupportedMailProvider(id)) {
    logger.warn({ mailProvider: id }, 'Unknown MAIL_PROVIDER, email delivery disabled');
    return null;
  }
  const provider = providers[id];
  if (!provider.isConfigured) {
    logger.warn(
      { mailProvider: id },
      'Selected mail provider is missing credentials, email delivery disabled',
    );
    return null;
  }
  return provider;
}

export type { MailProviderDefinition, OutgoingMail } from './types.js';
