import type { FastifyInstance } from 'fastify';
import {
  addTeamMemberHandler,
  createTeamHandler,
  deleteTeamHandler,
  getTeamHandler,
  listTeamMembersHandler,
  listTeamsHandler,
  removeTeamMemberHandler,
  updateTeamHandler,
  updateTeamMemberHandler,
} from '../controllers/team-controller.js';
import { requirePermissions, requireTeamAccess } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface TeamParams {
  Params: { organizationId: string; teamId: string };
}

interface MemberParams {
  Params: { organizationId: string; teamId: string; userId: string };
}

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  // Organization-wide permissions. Team-scoped routes additionally accept
  // members with the manager toggle on that team (requireTeamAccess).
  const orgWrite = requirePermissions(PERMISSIONS.TEAM_MANAGEMENT_WRITE);
  const read = requireTeamAccess(PERMISSIONS.TEAM_MANAGEMENT_READ);
  const write = requireTeamAccess(PERMISSIONS.TEAM_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/teams',
    { preHandler: read },
    listTeamsHandler,
  );

  // Creating and deleting teams is organization-level only.
  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/teams',
    { preHandler: orgWrite },
    createTeamHandler,
  );

  app.get<TeamParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId',
    { preHandler: read },
    getTeamHandler,
  );

  app.patch<TeamParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId',
    { preHandler: write },
    updateTeamHandler,
  );

  app.delete<TeamParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId',
    { preHandler: orgWrite },
    deleteTeamHandler,
  );

  app.get<TeamParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId/members',
    { preHandler: read },
    listTeamMembersHandler,
  );

  app.post<TeamParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId/members',
    { preHandler: write },
    addTeamMemberHandler,
  );

  app.patch<MemberParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId/members/:userId',
    { preHandler: write },
    updateTeamMemberHandler,
  );

  app.delete<MemberParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId/members/:userId',
    { preHandler: write },
    removeTeamMemberHandler,
  );
}
