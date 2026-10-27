import type { FastifyInstance } from 'fastify';
import { listWorkRoleUsersHandler } from '../controllers/user-work-role-controller.js';
import {
  addCertificationToWorkRoleHandler,
  createWorkRoleHandler,
  deleteWorkRoleHandler,
  getWorkRoleHandler,
  listAllWorkRolesHandler,
  listWorkRoleCertificationsHandler,
  listWorkRolesHandler,
  removeCertificationFromWorkRoleHandler,
  updateWorkRoleHandler,
} from '../controllers/work-role-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface WorkRoleParams {
  Params: { organizationId: string; workRoleId: string };
}

interface WorkRoleCertParams {
  Params: { organizationId: string; workRoleId: string; certificationId: string };
}

export async function workRoleRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.WORK_ROLE_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.WORK_ROLE_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/work-roles',
    { preHandler: read },
    listWorkRolesHandler,
  );

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/work-roles/all',
    { preHandler: read },
    listAllWorkRolesHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/work-roles',
    { preHandler: write },
    createWorkRoleHandler,
  );

  app.get<WorkRoleParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId',
    { preHandler: read },
    getWorkRoleHandler,
  );

  app.patch<WorkRoleParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId',
    { preHandler: write },
    updateWorkRoleHandler,
  );

  app.delete<WorkRoleParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId',
    { preHandler: write },
    deleteWorkRoleHandler,
  );

  // Required certifications for a work role
  app.get<WorkRoleParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId/certifications',
    { preHandler: read },
    listWorkRoleCertificationsHandler,
  );

  app.post<WorkRoleParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId/certifications',
    { preHandler: write },
    addCertificationToWorkRoleHandler,
  );

  app.delete<WorkRoleCertParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId/certifications/:certificationId',
    { preHandler: write },
    removeCertificationFromWorkRoleHandler,
  );

  // Users assigned to a work role
  app.get<WorkRoleParams>(
    '/api/v1/organizations/:organizationId/work-roles/:workRoleId/users',
    { preHandler: read },
    listWorkRoleUsersHandler,
  );
}
