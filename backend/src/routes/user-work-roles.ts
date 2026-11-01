import type { FastifyInstance } from 'fastify';
import {
  addMyCertificationHandler,
  addMyWorkRoleHandler,
  addUserCertificationHandler,
  addUserWorkRoleHandler,
  getMyCertificationsHandler,
  getMyWorkRolesHandler,
  listUserCertificationsHandler,
  listUserWorkRolesHandler,
  removeMyCertificationHandler,
  removeMyWorkRoleHandler,
  removeUserCertificationHandler,
  removeUserWorkRoleHandler,
  updateMyCertificationHandler,
  updateUserCertificationHandler,
  updateUserWorkRoleHandler,
} from '../controllers/user-work-role-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface UserParams {
  Params: { organizationId: string; userId: string };
}

interface UserWorkRoleIdParams {
  Params: { organizationId: string; userWorkRoleId: string };
}

interface UserCertificationIdParams {
  Params: { organizationId: string; userCertificationId: string };
}

export async function userWorkRoleRoutes(app: FastifyInstance): Promise<void> {
  const auth = requirePermissions();
  const read = requirePermissions(PERMISSIONS.WORK_ROLE_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.WORK_ROLE_MANAGEMENT_WRITE);

  // --- Self-service: current user's work roles ---

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/my/work-roles',
    { preHandler: auth },
    getMyWorkRolesHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/my/work-roles',
    { preHandler: auth },
    addMyWorkRoleHandler,
  );

  app.delete<UserWorkRoleIdParams>(
    '/api/v1/organizations/:organizationId/my/work-roles/:userWorkRoleId',
    { preHandler: auth },
    removeMyWorkRoleHandler,
  );

  // --- Self-service: current user's certifications ---

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/my/certifications',
    { preHandler: auth },
    getMyCertificationsHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/my/certifications',
    { preHandler: auth },
    addMyCertificationHandler,
  );

  app.delete<UserCertificationIdParams>(
    '/api/v1/organizations/:organizationId/my/certifications/:userCertificationId',
    { preHandler: auth },
    removeMyCertificationHandler,
  );

  app.patch<UserCertificationIdParams>(
    '/api/v1/organizations/:organizationId/my/certifications/:userCertificationId',
    { preHandler: auth },
    updateMyCertificationHandler,
  );

  // --- Admin: manage any user's work roles ---

  app.get<UserParams>(
    '/api/v1/organizations/:organizationId/users/:userId/work-roles',
    { preHandler: read },
    listUserWorkRolesHandler,
  );

  app.post<UserParams>(
    '/api/v1/organizations/:organizationId/users/:userId/work-roles',
    { preHandler: write },
    addUserWorkRoleHandler,
  );

  app.patch<UserWorkRoleIdParams>(
    '/api/v1/organizations/:organizationId/users/work-roles/:userWorkRoleId',
    { preHandler: write },
    updateUserWorkRoleHandler,
  );

  app.delete<UserWorkRoleIdParams>(
    '/api/v1/organizations/:organizationId/users/work-roles/:userWorkRoleId',
    { preHandler: write },
    removeUserWorkRoleHandler,
  );

  // --- Admin: manage any user's certifications ---

  app.get<UserParams>(
    '/api/v1/organizations/:organizationId/users/:userId/certifications',
    { preHandler: read },
    listUserCertificationsHandler,
  );

  app.post<UserParams>(
    '/api/v1/organizations/:organizationId/users/:userId/certifications',
    { preHandler: write },
    addUserCertificationHandler,
  );

  app.delete<UserCertificationIdParams>(
    '/api/v1/organizations/:organizationId/users/certifications/:userCertificationId',
    { preHandler: write },
    removeUserCertificationHandler,
  );

  app.patch<UserCertificationIdParams>(
    '/api/v1/organizations/:organizationId/users/certifications/:userCertificationId',
    { preHandler: write },
    updateUserCertificationHandler,
  );
}
