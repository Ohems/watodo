import type { FastifyInstance } from 'fastify';
import { listMyOrganizationsHandler } from '../controllers/organization-controller.js';
import { requirePermissions } from '../middleware/auth.js';

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/organizations',
    { preHandler: requirePermissions() },
    listMyOrganizationsHandler,
  );
}
