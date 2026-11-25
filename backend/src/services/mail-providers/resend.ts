import { config } from '../../config.js';
import { postJson } from './shared.js';
import type { MailProviderDefinition, OutgoingMail } from './types.js';

/** Resend (https://resend.com): POST https://api.resend.com/emails with a Bearer API key. */
export const resendProvider: MailProviderDefinition = {
  id: 'resend',
  get isConfigured() {
    return Boolean(config.resendApiKey && config.mailFrom);
  },
  async sendMail(mail: OutgoingMail): Promise<void> {
    await postJson('https://api.resend.com/emails', {
      headers: { Authorization: `Bearer ${config.resendApiKey}` },
      body: {
        from: config.mailFrom,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      },
    });
  },
};
