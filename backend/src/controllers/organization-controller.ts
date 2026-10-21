import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import { listOrganizationsForUser } from '../services/organization-service.js';

export async function listMyOrganizationsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const organizations = await listOrganizationsForUser(auth.user.id);
  return reply.status(200).send(organizations);
}
