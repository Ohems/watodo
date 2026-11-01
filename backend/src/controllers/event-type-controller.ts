import type { FastifyReply, FastifyRequest } from 'fastify';
import { organizationParamsSchema } from '../schemas/index.js';
import { listEventTypes } from '../services/event-type-service.js';

export async function listEventTypesHandler(
  request: FastifyRequest<{ Params: { organizationId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const eventTypes = await listEventTypes(organizationId);
  return reply.status(200).send(eventTypes);
}
