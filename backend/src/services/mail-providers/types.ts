/** A single outgoing email, already rendered in the recipient's language. */
export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * A mail delivery backend. One implementation per file in this directory,
 * registered in index.ts; the host picks one with the MAIL_PROVIDER env var.
 * A provider whose credentials are missing reports `isConfigured: false` and
 * email delivery stays disabled (same convention as the OAuth providers).
 */
export interface MailProviderDefinition {
  id: string;
  readonly isConfigured: boolean;
  sendMail(mail: OutgoingMail): Promise<void>;
}
