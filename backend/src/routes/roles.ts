import type { FastifyInstance } from 'fastify';
import {
  assignRoleHandler,
  createRoleHandler,
  deleteRoleHandler,
  listAssignmentsHandler,
  listRolesHandler,
  unassignRoleHandler,
  updateRoleHandler,
} from '../controllers/role-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrganizationParams {
  Params: { organizationId: string };
}

interface RoleParams {
  Params: { organizationId: string; roleId: string };
}

interface AssignmentParams {
  Params: { organizationId: string; roleId: string; assignmentId: string };
}

export async function roleRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.ROLE_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.ROLE_MANAGEMENT_WRITE);

  app.get<OrganizationParams>(
    '/api/v1/organizations/:organizationId/roles',
    { preHandler: read },
    listRolesHandler,
  );

  app.post<OrganizationParams>(
    '/api/v1/organizations/:organizationId/roles',
    { preHandler: write },
    createRoleHandler,
  );

  app.patch<RoleParams>(
    '/api/v1/organizations/:organizationId/roles/:roleId',
    { preHandler: write },
    updateRoleHandler,
  );

  app.delete<RoleParams>(
    '/api/v1/organizations/:organizationId/roles/:roleId',
    { preHandler: write },
    deleteRoleHandler,
  );

  app.get<RoleParams>(
    '/api/v1/organizations/:organizationId/roles/:roleId/assignments',
    { preHandler: read },
    listAssignmentsHandler,
  );

  app.post<RoleParams>(
    '/api/v1/organizations/:organizationId/roles/:roleId/assignments',
    { preHandler: write },
    assignRoleHandler,
  );

  app.delete<AssignmentParams>(
    '/api/v1/organizations/:organizationId/roles/:roleId/assignments/:assignmentId',
    { preHandler: write },
    unassignRoleHandler,
  );
}
