import type { FastifyInstance } from 'fastify';
import {
  getOrganizationHandler,
  listMyOrganizationsHandler,
  listOrganizationUsersHandler,
  updateOrganizationHandler,
} from '../controllers/organization-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrganizationParams {
  Params: { organizationId: string };
}

export async function organizationRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/organizations',
    { preHandler: requirePermissions() },
    listMyOrganizationsHandler,
  );

  app.get<OrganizationParams>(
    '/api/v1/organizations/:organizationId',
    { preHandler: requirePermissions() },
    getOrganizationHandler,
  );

  app.patch<OrganizationParams>(
    '/api/v1/organizations/:organizationId',
    { preHandler: requirePermissions(PERMISSIONS.ORGANIZATION_WRITE) },
    updateOrganizationHandler,
  );

  app.get<OrganizationParams>(
    '/api/v1/organizations/:organizationId/users',
    { preHandler: requirePermissions(PERMISSIONS.ORGANIZATION_READ) },
    listOrganizationUsersHandler,
  );
}
