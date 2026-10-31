import { db } from '../database.js';
import type { Team, TeamType } from '../db/types.js';
import { badRequest, isUniqueViolation, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type {
  TableQuery,
  TeamMemberInput,
  TeamMemberUpdate,
  TeamPush,
  TeamUpdate,
} from '../schemas/index.js';

const logger = createLogger('team-service');

export interface TeamMemberResponse {
  id: number;
  teamId: string;
  userId: string;
  userName: string;
  userEmail: string;
  /** When true, the member can manage this specific team. */
  isManager: boolean;
  createdAt: string;
}

export interface TeamResponse {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  teamType: TeamType;
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  eventTypeId: number | null;
  eventTypeName: string | null;
  workRoleId: number | null;
  workRoleName: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedTeams {
  items: TeamResponse[];
  total: number;
  page: number;
  limit: number;
}

/** Display names for the optional team links, resolved in batch. */
interface TeamLinkNames {
  teamLeaderName: string | null;
  eventTypeName: string | null;
  workRoleName: string | null;
}

function serializeTeam(team: Team, memberCount: number, links: TeamLinkNames): TeamResponse {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    organizationId: team.organization_id,
    teamType: team.team_type,
    teamLeaderId: team.team_leader_id,
    teamLeaderName: links.teamLeaderName,
    eventTypeId: team.event_type_id,
    eventTypeName: links.eventTypeName,
    workRoleId: team.work_role_id,
    workRoleName: links.workRoleName,
    memberCount,
    createdAt: team.created_at.toISOString(),
    updatedAt: team.updated_at.toISOString(),
  };
}

async function getTeamLinkNames(teams: Team[]): Promise<Map<string, TeamLinkNames>> {
  const result = new Map<string, TeamLinkNames>();
  if (teams.length === 0) return result;
  const leaderIds = [
    ...new Set(teams.map(t => t.team_leader_id).filter((id): id is string => id !== null)),
  ];
  const eventTypeIds = [
    ...new Set(teams.map(t => t.event_type_id).filter((id): id is number => id !== null)),
  ];
  const workRoleIds = [
    ...new Set(teams.map(t => t.work_role_id).filter((id): id is number => id !== null)),
  ];
  const [leaders, eventTypes, workRoles] = await Promise.all([
    leaderIds.length > 0
      ? db.selectFrom('users').select(['id', 'name']).where('id', 'in', leaderIds).execute()
      : Promise.resolve([]),
    eventTypeIds.length > 0
      ? db
          .selectFrom('event_types')
          .select(['id', 'name'])
          .where('id', 'in', eventTypeIds)
          .execute()
      : Promise.resolve([]),
    workRoleIds.length > 0
      ? db.selectFrom('work_roles').select(['id', 'name']).where('id', 'in', workRoleIds).execute()
      : Promise.resolve([]),
  ]);
  const leaderNames = new Map(leaders.map(l => [l.id, l.name]));
  const eventTypeNames = new Map(eventTypes.map(e => [e.id, e.name]));
  const workRoleNames = new Map(workRoles.map(w => [w.id, w.name]));
  for (const team of teams) {
    result.set(team.id, {
      teamLeaderName: team.team_leader_id ? (leaderNames.get(team.team_leader_id) ?? null) : null,
      eventTypeName: team.event_type_id ? (eventTypeNames.get(team.event_type_id) ?? null) : null,
      workRoleName: team.work_role_id ? (workRoleNames.get(team.work_role_id) ?? null) : null,
    });
  }
  return result;
}

/**
 * Validates the team purpose links against the organization: the linked event
 * type, work role and team leader must all belong to the organization, and the
 * links must match the team type.
 */
async function validateTeamLinks(
  organizationId: string,
  teamType: TeamType,
  eventTypeId: number | null,
  workRoleId: number | null,
  teamLeaderId: string | null,
): Promise<void> {
  if (teamType === 'event_organizers' && eventTypeId === null) {
    throw badRequest('An event organizer team must be linked to an event type!');
  }
  if (teamType === 'role_group' && workRoleId === null) {
    throw badRequest('A role group team must be linked to a work role!');
  }
  if (teamType === 'general' && (eventTypeId !== null || workRoleId !== null)) {
    throw badRequest(
      'Only event organizer or role group teams can have an event type or work role link!',
    );
  }
  if (teamType === 'event_organizers' && workRoleId !== null) {
    throw badRequest('An event organizer team cannot be linked to a work role!');
  }
  if (teamType === 'role_group' && eventTypeId !== null) {
    throw badRequest('A role group team cannot be linked to an event type!');
  }
  if (eventTypeId !== null) {
    const eventType = await db
      .selectFrom('event_types')
      .innerJoin('calendars', 'calendars.id', 'event_types.calendar_id')
      .select('event_types.id')
      .where('event_types.id', '=', eventTypeId)
      .where('calendars.organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!eventType) {
      throw notFound(`Event type ${eventTypeId} not found in organization ${organizationId}!`);
    }
  }
  if (workRoleId !== null) {
    const workRole = await db
      .selectFrom('work_roles')
      .select('id')
      .where('id', '=', workRoleId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!workRole) {
      throw notFound(`Work role ${workRoleId} not found in organization ${organizationId}!`);
    }
  }
  if (teamLeaderId !== null) {
    const membership = await db
      .selectFrom('user_organizations')
      .select('user_id')
      .where('user_id', '=', teamLeaderId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!membership) {
      throw notFound(`User ${teamLeaderId} is not a member of organization ${organizationId}!`);
    }
  }
}

async function getMemberCounts(teamIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (teamIds.length === 0) return result;
  const rows = await db
    .selectFrom('team_members')
    .select(['team_id', db.fn.countAll().as('count')])
    .where('team_id', 'in', teamIds)
    .groupBy('team_id')
    .execute();
  for (const row of rows) {
    result.set(row.team_id, Number(row.count));
  }
  return result;
}

/**
 * Lists teams in an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated teams.
 */
export async function listTeams(
  organizationId: string,
  query: TableQuery = {},
  onlyTeamIds?: string[],
): Promise<PaginatedTeams> {
  logger.trace('teamService.listTeams');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db.selectFrom('teams').selectAll().where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('teams')
    .select(db.fn.countAll().as('count'))
    .where('organization_id', '=', organizationId);

  // Users without organization-wide team-management:read only see the teams
  // they manage.
  if (onlyTeamIds) {
    if (onlyTeamIds.length === 0) {
      return { items: [], total: 0, page, limit };
    }
    baseQuery = baseQuery.where('id', 'in', onlyTeamIds);
    countQuery = countQuery.where('id', 'in', onlyTeamIds);
  }

  if (search) {
    baseQuery = baseQuery.where('name', 'ilike', `%${search}%`);
    countQuery = countQuery.where('name', 'ilike', `%${search}%`);
  }

  const [rows, countRow] = await Promise.all([
    baseQuery
      .orderBy('name', 'asc')
      .limit(limit)
      .offset(page * limit)
      .execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const [counts, linkNames] = await Promise.all([
    getMemberCounts(rows.map(r => r.id)),
    getTeamLinkNames(rows),
  ]);
  const items = rows.map(row =>
    serializeTeam(
      row,
      counts.get(row.id) ?? 0,
      linkNames.get(row.id) ?? {
        teamLeaderName: null,
        eventTypeName: null,
        workRoleName: null,
      },
    ),
  );

  return {
    items,
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Gets a single team with its members.
 * @param teamId - The team ID.
 * @returns The team.
 */
export async function getTeam(teamId: string): Promise<TeamResponse> {
  logger.trace('teamService.getTeam');
  const team = await db.selectFrom('teams').selectAll().where('id', '=', teamId).executeTakeFirst();
  if (!team) {
    throw notFound(`Team ${teamId} not found!`);
  }
  const [counts, linkNames] = await Promise.all([
    getMemberCounts([team.id]),
    getTeamLinkNames([team]),
  ]);
  return serializeTeam(
    team,
    counts.get(team.id) ?? 0,
    linkNames.get(team.id) ?? { teamLeaderName: null, eventTypeName: null, workRoleName: null },
  );
}

/**
 * Creates a new team.
 * @param data - The team data.
 * @returns The created team.
 */
export async function createTeam(data: TeamPush): Promise<TeamResponse> {
  logger.trace('teamService.createTeam');
  const teamType = data.teamType ?? 'general';
  const eventTypeId = data.eventTypeId ?? null;
  const workRoleId = data.workRoleId ?? null;
  await validateTeamLinks(
    data.organizationId,
    teamType,
    eventTypeId,
    workRoleId,
    data.teamLeaderId ?? null,
  );
  const team = await db
    .insertInto('teams')
    .values({
      name: data.name,
      description: data.description ?? '',
      organization_id: data.organizationId,
      team_type: teamType,
      team_leader_id: data.teamLeaderId ?? null,
      event_type_id: eventTypeId,
      work_role_id: workRoleId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const linkNames = await getTeamLinkNames([team]);
  return serializeTeam(
    team,
    0,
    linkNames.get(team.id) ?? { teamLeaderName: null, eventTypeName: null, workRoleName: null },
  );
}

/**
 * Updates a team.
 * @param teamId - The team ID.
 * @param data - The fields to update.
 * @returns The updated team.
 */
export async function updateTeam(teamId: string, data: TeamUpdate): Promise<TeamResponse> {
  logger.trace('teamService.updateTeam');
  const existing = await db
    .selectFrom('teams')
    .selectAll()
    .where('id', '=', teamId)
    .executeTakeFirst();
  if (!existing) {
    throw notFound(`Team ${teamId} not found!`);
  }
  // Merge with the existing row so partial updates keep the current purpose
  // links, then validate the merged state as a whole.
  const teamType = data.teamType ?? existing.team_type;
  const eventTypeId = data.eventTypeId !== undefined ? data.eventTypeId : existing.event_type_id;
  const workRoleId = data.workRoleId !== undefined ? data.workRoleId : existing.work_role_id;
  const teamLeaderId =
    data.teamLeaderId !== undefined ? data.teamLeaderId : existing.team_leader_id;
  await validateTeamLinks(
    existing.organization_id,
    teamType,
    eventTypeId,
    workRoleId,
    teamLeaderId,
  );
  const updated = await db
    .updateTable('teams')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.teamType !== undefined ? { team_type: teamType } : {}),
      ...(data.teamLeaderId !== undefined ? { team_leader_id: teamLeaderId } : {}),
      ...(data.eventTypeId !== undefined ? { event_type_id: eventTypeId } : {}),
      ...(data.workRoleId !== undefined ? { work_role_id: workRoleId } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', teamId)
    .returningAll()
    .executeTakeFirstOrThrow();
  const [counts, linkNames] = await Promise.all([
    getMemberCounts([updated.id]),
    getTeamLinkNames([updated]),
  ]);
  return serializeTeam(
    updated,
    counts.get(updated.id) ?? 0,
    linkNames.get(updated.id) ?? { teamLeaderName: null, eventTypeName: null, workRoleName: null },
  );
}

/**
 * Deletes a team.
 * @param teamId - The team ID.
 */
export async function deleteTeam(teamId: string): Promise<void> {
  logger.trace('teamService.deleteTeam');
  const result = await db.deleteFrom('teams').where('id', '=', teamId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Team ${teamId} not found!`);
  }
}

/**
 * Lists the members of a team.
 * @param teamId - The team ID.
 * @returns The team members with user details.
 */
export async function listTeamMembers(teamId: string): Promise<TeamMemberResponse[]> {
  logger.trace('teamService.listTeamMembers');
  const team = await db
    .selectFrom('teams')
    .select('id')
    .where('id', '=', teamId)
    .executeTakeFirst();
  if (!team) {
    throw notFound(`Team ${teamId} not found!`);
  }

  const rows = await db
    .selectFrom('team_members')
    .innerJoin('users', 'users.id', 'team_members.user_id')
    .select([
      'team_members.id',
      'team_members.team_id',
      'team_members.user_id',
      'team_members.is_manager',
      'team_members.created_at',
      'users.name as user_name',
      'users.email as user_email',
    ])
    .where('team_members.team_id', '=', teamId)
    .orderBy('users.name', 'asc')
    .execute();

  return rows.map(row => ({
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    isManager: row.is_manager,
    createdAt: row.created_at.toISOString(),
  }));
}

/**
 * Adds a user to a team.
 * @param teamId - The team ID.
 * @param data - The member data.
 * @returns The created membership.
 */
export async function addTeamMember(
  teamId: string,
  data: TeamMemberInput,
): Promise<TeamMemberResponse> {
  logger.trace('teamService.addTeamMember');
  const team = await db
    .selectFrom('teams')
    .select('id')
    .where('id', '=', teamId)
    .executeTakeFirst();
  if (!team) {
    throw notFound(`Team ${teamId} not found!`);
  }

  const user = await db
    .selectFrom('users')
    .select(['id', 'name', 'email'])
    .where('id', '=', data.userId)
    .executeTakeFirst();
  if (!user) {
    throw notFound(`User ${data.userId} not found!`);
  }

  try {
    const member = await db
      .insertInto('team_members')
      .values({ team_id: teamId, user_id: data.userId, is_manager: data.isManager ?? false })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: member.id,
      teamId: member.team_id,
      userId: member.user_id,
      userName: user.name,
      userEmail: user.email,
      isManager: member.is_manager,
      createdAt: member.created_at.toISOString(),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest('User is already a member of this team!');
    }
    throw error;
  }
}

/**
 * Updates a team member (currently only the manager toggle).
 * @param teamId - The team ID.
 * @param userId - The user ID.
 * @param data - The fields to update.
 * @returns The updated membership.
 */
export async function updateTeamMember(
  teamId: string,
  userId: string,
  data: TeamMemberUpdate,
): Promise<TeamMemberResponse> {
  logger.trace('teamService.updateTeamMember');
  const member = await db
    .updateTable('team_members')
    .set({
      ...(data.isManager !== undefined ? { is_manager: data.isManager } : {}),
    })
    .where('team_id', '=', teamId)
    .where('user_id', '=', userId)
    .returningAll()
    .executeTakeFirst();
  if (!member) {
    throw notFound('User is not a member of this team!');
  }
  const user = await db
    .selectFrom('users')
    .select(['name', 'email'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  return {
    id: member.id,
    teamId: member.team_id,
    userId: member.user_id,
    userName: user.name,
    userEmail: user.email,
    isManager: member.is_manager,
    createdAt: member.created_at.toISOString(),
  };
}

/**
 * Removes a user from a team.
 * @param teamId - The team ID.
 * @param userId - The user ID.
 */
export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  logger.trace('teamService.removeTeamMember');
  const result = await db
    .deleteFrom('team_members')
    .where('team_id', '=', teamId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound('User is not a member of this team!');
  }
}

/**
 * Gets the team IDs a user belongs to.
 * @param userId - The user ID.
 * @returns The team IDs.
 */
export async function getUserTeamIds(userId: string): Promise<string[]> {
  const rows = await db
    .selectFrom('team_members')
    .select('team_id')
    .where('user_id', '=', userId)
    .execute();
  return rows.map(r => r.team_id);
}

/**
 * Gets the IDs of the teams the user can manage via the team member manager
 * toggle, optionally restricted to one organization.
 * @param userId - The user ID.
 * @param organizationId - Optional organization to restrict to.
 * @returns The manageable team IDs.
 */
export async function getManagedTeamIds(
  userId: string,
  organizationId?: string,
): Promise<string[]> {
  let query = db
    .selectFrom('team_members')
    .innerJoin('teams', 'teams.id', 'team_members.team_id')
    .select('team_members.team_id')
    .where('team_members.user_id', '=', userId)
    .where('team_members.is_manager', '=', true);
  if (organizationId) {
    query = query.where('teams.organization_id', '=', organizationId);
  }
  const rows = await query.execute();
  return rows.map(r => r.team_id);
}

/**
 * Checks whether the user can manage the given team via the team member
 * manager toggle. When organizationId is given, the team must belong to it.
 * @param userId - The user ID.
 * @param teamId - The team ID.
 * @param organizationId - Optional organization the team must belong to.
 * @returns True when the user is a manager member of the team.
 */
export async function isTeamManager(
  userId: string,
  teamId: string,
  organizationId?: string,
): Promise<boolean> {
  let query = db
    .selectFrom('team_members')
    .innerJoin('teams', 'teams.id', 'team_members.team_id')
    .select('team_members.id')
    .where('team_members.user_id', '=', userId)
    .where('team_members.team_id', '=', teamId)
    .where('team_members.is_manager', '=', true);
  if (organizationId) {
    query = query.where('teams.organization_id', '=', organizationId);
  }
  const row = await query.executeTakeFirst();
  return row !== undefined;
}
