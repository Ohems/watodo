import type { FastifyInstance } from 'fastify';
import { listEventTypesHandler } from '../controllers/event-type-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

export async function eventTypeRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.EVENTS_READ);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/event-types',
    { preHandler: read },
    listEventTypesHandler,
  );
}
