import { config } from '../../config.js';
import { postJson } from './shared.js';
import type { MailProviderDefinition, OutgoingMail } from './types.js';

/**
 * useSend (https://usesend.com): POST {base}/v1/emails with a Bearer API key.
 * USESEND_BASE_URL points at a self-hosted instance instead of the cloud API.
 */
export const usesendProvider: MailProviderDefinition = {
  id: 'usesend',
  get isConfigured() {
    return Boolean(config.usesendApiKey && config.mailFrom);
  },
  async sendMail(mail: OutgoingMail): Promise<void> {
    const baseUrl = config.usesendBaseUrl.replace(/\/+$/, '');
    await postJson(`${baseUrl}/v1/emails`, {
      headers: { Authorization: `Bearer ${config.usesendApiKey}` },
      body: {
        from: config.mailFrom,
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      },
    });
  },
};
