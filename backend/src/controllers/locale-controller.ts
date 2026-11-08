import type { FastifyReply, FastifyRequest } from 'fastify';
import { getNotificationMessages } from '../i18n/index.js';
import { localeParamsSchema } from '../schemas/index.js';

/**
 * Serves the server-owned translations of a locale (currently the
 * notification message templates) so the frontend can render them in the
 * user's language with a single source of truth. Public like the auth
 * provider list: it only contains translation strings.
 */
export async function getLocaleBundleHandler(
  request: FastifyRequest<{ Params: { lng: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { lng } = localeParamsSchema.parse(request.params);
  return reply.status(200).send({ lng, notifications: getNotificationMessages(lng) });
}
