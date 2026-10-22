import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import { organizationParamsSchema, organizationUpdateSchema } from '../schemas/index.js';
import {
  getOrganizationForUser,
  listOrganizationsForUser,
  updateOrganization,
} from '../services/organization-service.js';

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

export async function getOrganizationHandler(
  request: FastifyRequest<{ Params: { organizationId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const organization = await getOrganizationForUser(organizationId, auth.user.id);
  return reply.status(200).send(organization);
}

export async function updateOrganizationHandler(
  request: FastifyRequest<{ Params: { organizationId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const data = organizationUpdateSchema.parse(request.body);
  const organization = await updateOrganization(organizationId, auth.user.id, data);
  return reply.status(200).send(organization);
}
