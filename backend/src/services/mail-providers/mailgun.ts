import { config } from '../../config.js';
import type { MailProviderDefinition, OutgoingMail } from './types.js';

/** Mailgun (https://www.mailgun.com): form POST to the v3 messages API, basic auth `api:<key>`. */
export const mailgunProvider: MailProviderDefinition = {
  id: 'mailgun',
  get isConfigured() {
    return Boolean(config.mailgunApiKey && config.mailgunDomain && config.mailFrom);
  },
  async sendMail(mail: OutgoingMail): Promise<void> {
    const host = config.mailgunRegion === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
    const url = `https://${host}/v3/${config.mailgunDomain}/messages`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${config.mailgunApiKey}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        from: config.mailFrom,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Mailgun answered ${response.status}: ${detail.slice(0, 300)}`);
    }
  },
};
