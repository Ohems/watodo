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
} from '../controllers/team-controller.js';
import { requirePermissions } from '../middleware/auth.js';
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
  const read = requirePermissions(PERMISSIONS.TEAM_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.TEAM_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/teams',
    { preHandler: read },
    listTeamsHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/teams',
    { preHandler: write },
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
    { preHandler: write },
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

  app.delete<MemberParams>(
    '/api/v1/organizations/:organizationId/teams/:teamId/members/:userId',
    { preHandler: write },
    removeTeamMemberHandler,
  );
}
