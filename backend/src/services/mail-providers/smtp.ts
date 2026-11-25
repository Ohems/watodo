import { config } from '../../config.js';
import type { MailProviderDefinition, OutgoingMail } from './types.js';

/**
 * SMTP via nodemailer. nodemailer is an optional dependency: hosts that pick an
 * HTTP provider (resend/mailgun/usesend) do not need to install it. The import
 * is lazy so the rest of the app works without it.
 */
export const smtpProvider: MailProviderDefinition = {
  id: 'smtp',
  get isConfigured() {
    return Boolean(config.smtpHost && config.mailFrom);
  },
  async sendMail(mail: OutgoingMail): Promise<void> {
    let createTransport: typeof import('nodemailer').createTransport;
    try {
      ({ createTransport } = await import('nodemailer'));
    } catch {
      throw new Error(
        'The smtp mail provider needs the optional dependency "nodemailer" (run `npm install` in backend/)',
      );
    }
    const transport = createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
    await transport.sendMail({
      from: config.mailFrom,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
  },
};
