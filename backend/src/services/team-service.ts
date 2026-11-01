import type { Transaction } from 'kysely';
import { db } from '../database.js';
import type { Database, Team } from '../db/types.js';
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

export interface TeamWorkRoleLink {
  id: number;
  name: string;
}

export interface TeamEventSeriesLink {
  id: number;
  title: string;
}

export interface TeamResponse {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  /** Work roles assigned to the team. */
  workRoles: TeamWorkRoleLink[];
  /** Event series assigned to the team. */
  eventSeries: TeamEventSeriesLink[];
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

/** Resolved team links (leader name, work roles, event series), per team. */
interface TeamLinks {
  teamLeaderName: string | null;
  workRoles: TeamWorkRoleLink[];
  eventSeries: TeamEventSeriesLink[];
}

function serializeTeam(team: Team, memberCount: number, links: TeamLinks): TeamResponse {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    organizationId: team.organization_id,
    teamLeaderId: team.team_leader_id,
    teamLeaderName: links.teamLeaderName,
    workRoles: links.workRoles,
    eventSeries: links.eventSeries,
    memberCount,
    createdAt: team.created_at.toISOString(),
    updatedAt: team.updated_at.toISOString(),
  };
}

async function getTeamLinks(teams: Team[]): Promise<Map<string, TeamLinks>> {
  const result = new Map<string, TeamLinks>();
  if (teams.length === 0) return result;
  const teamIds = teams.map(t => t.id);
  const leaderIds = [
    ...new Set(teams.map(t => t.team_leader_id).filter((id): id is string => id !== null)),
  ];
  const [leaders, workRoleRows, seriesRows] = await Promise.all([
    leaderIds.length > 0
      ? db.selectFrom('users').select(['id', 'name']).where('id', 'in', leaderIds).execute()
      : Promise.resolve([]),
    db
      .selectFrom('team_work_roles')
      .innerJoin('work_roles', 'work_roles.id', 'team_work_roles.work_role_id')
      .select([
        'team_work_roles.team_id',
        'work_roles.id as work_role_id',
        'work_roles.name as work_role_name',
      ])
      .where('team_work_roles.team_id', 'in', teamIds)
      .orderBy('work_roles.name', 'asc')
      .execute(),
    db
      .selectFrom('event_series_teams')
      .innerJoin('event_series', 'event_series.id', 'event_series_teams.event_series_id')
      .select([
        'event_series_teams.team_id',
        'event_series.id as event_series_id',
        'event_series.title as event_series_title',
      ])
      .where('event_series_teams.team_id', 'in', teamIds)
      .orderBy('event_series.title', 'asc')
      .execute(),
  ]);
  const leaderNames = new Map(leaders.map(l => [l.id, l.name]));
  const workRolesByTeam = new Map<string, TeamWorkRoleLink[]>();
  for (const row of workRoleRows) {
    const list = workRolesByTeam.get(row.team_id) ?? [];
    list.push({ id: row.work_role_id, name: row.work_role_name });
    workRolesByTeam.set(row.team_id, list);
  }
  const seriesByTeam = new Map<string, TeamEventSeriesLink[]>();
  for (const row of seriesRows) {
    const list = seriesByTeam.get(row.team_id) ?? [];
    list.push({ id: row.event_series_id, title: row.event_series_title });
    seriesByTeam.set(row.team_id, list);
  }
  for (const team of teams) {
    result.set(team.id, {
      teamLeaderName: team.team_leader_id ? (leaderNames.get(team.team_leader_id) ?? null) : null,
      workRoles: workRolesByTeam.get(team.id) ?? [],
      eventSeries: seriesByTeam.get(team.id) ?? [],
    });
  }
  return result;
}

/**
 * Validates the team links against the organization: the assigned work roles
 * and event series and the team leader must all belong to the organization.
 */
async function validateTeamLinks(
  organizationId: string,
  workRoleIds: number[],
  eventSeriesIds: number[],
  teamLeaderId: string | null,
): Promise<void> {
  if (workRoleIds.length > 0) {
    const workRoles = await db
      .selectFrom('work_roles')
      .select('id')
      .where('id', 'in', workRoleIds)
      .where('organization_id', '=', organizationId)
      .execute();
    if (workRoles.length !== new Set(workRoleIds).size) {
      throw notFound(`One or more work roles not found in organization ${organizationId}!`);
    }
  }
  if (eventSeriesIds.length > 0) {
    const series = await db
      .selectFrom('event_series')
      .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
      .select('event_series.id')
      .where('event_series.id', 'in', eventSeriesIds)
      .where('calendars.organization_id', '=', organizationId)
      .execute();
    if (series.length !== new Set(eventSeriesIds).size) {
      throw notFound(`One or more event series not found in organization ${organizationId}!`);
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

/** Replaces the team's work role and event series assignments in a transaction. */
async function syncTeamLinks(
  tx: Transaction<Database>,
  teamId: string,
  workRoleIds: number[],
  eventSeriesIds: number[],
): Promise<void> {
  await tx.deleteFrom('team_work_roles').where('team_id', '=', teamId).execute();
  if (workRoleIds.length > 0) {
    await tx
      .insertInto('team_work_roles')
      .values(workRoleIds.map(workRoleId => ({ team_id: teamId, work_role_id: workRoleId })))
      .execute();
  }
  await tx.deleteFrom('event_series_teams').where('team_id', '=', teamId).execute();
  if (eventSeriesIds.length > 0) {
    await tx
      .insertInto('event_series_teams')
      .values(eventSeriesIds.map(seriesId => ({ event_series_id: seriesId, team_id: teamId })))
      .execute();
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

  const [counts, links] = await Promise.all([
    getMemberCounts(rows.map(r => r.id)),
    getTeamLinks(rows),
  ]);
  const items = rows.map(row =>
    serializeTeam(
      row,
      counts.get(row.id) ?? 0,
      links.get(row.id) ?? { teamLeaderName: null, workRoles: [], eventSeries: [] },
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
  const [counts, links] = await Promise.all([getMemberCounts([team.id]), getTeamLinks([team])]);
  return serializeTeam(
    team,
    counts.get(team.id) ?? 0,
    links.get(team.id) ?? { teamLeaderName: null, workRoles: [], eventSeries: [] },
  );
}

/**
 * Creates a new team.
 * @param data - The team data.
 * @returns The created team.
 */
export async function createTeam(data: TeamPush): Promise<TeamResponse> {
  logger.trace('teamService.createTeam');
  const workRoleIds = data.workRoleIds ?? [];
  const eventSeriesIds = data.eventSeriesIds ?? [];
  await validateTeamLinks(
    data.organizationId,
    workRoleIds,
    eventSeriesIds,
    data.teamLeaderId ?? null,
  );
  const team = await db.transaction().execute(async tx => {
    const created = await tx
      .insertInto('teams')
      .values({
        name: data.name,
        description: data.description ?? '',
        organization_id: data.organizationId,
        team_leader_id: data.teamLeaderId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await syncTeamLinks(tx, created.id, workRoleIds, eventSeriesIds);
    return created;
  });
  const links = await getTeamLinks([team]);
  return serializeTeam(
    team,
    0,
    links.get(team.id) ?? { teamLeaderName: null, workRoles: [], eventSeries: [] },
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
  // Merge with the existing links so partial updates keep the current
  // assignments, then validate the merged state as a whole.
  let workRoleIds = data.workRoleIds;
  let eventSeriesIds = data.eventSeriesIds;
  if (workRoleIds === undefined || eventSeriesIds === undefined) {
    const [currentWorkRoles, currentSeries] = await Promise.all([
      workRoleIds === undefined
        ? db
            .selectFrom('team_work_roles')
            .select('work_role_id')
            .where('team_id', '=', teamId)
            .execute()
        : Promise.resolve(null),
      eventSeriesIds === undefined
        ? db
            .selectFrom('event_series_teams')
            .select('event_series_id')
            .where('team_id', '=', teamId)
            .execute()
        : Promise.resolve(null),
    ]);
    workRoleIds = workRoleIds ?? (currentWorkRoles ?? []).map(r => r.work_role_id);
    eventSeriesIds = eventSeriesIds ?? (currentSeries ?? []).map(r => r.event_series_id);
  }
  const teamLeaderId =
    data.teamLeaderId !== undefined ? data.teamLeaderId : existing.team_leader_id;
  await validateTeamLinks(existing.organization_id, workRoleIds, eventSeriesIds, teamLeaderId);
  const updated = await db.transaction().execute(async tx => {
    const row = await tx
      .updateTable('teams')
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.teamLeaderId !== undefined ? { team_leader_id: teamLeaderId } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', teamId)
      .returningAll()
      .executeTakeFirstOrThrow();
    await syncTeamLinks(tx, teamId, workRoleIds, eventSeriesIds);
    return row;
  });
  const [counts, links] = await Promise.all([
    getMemberCounts([updated.id]),
    getTeamLinks([updated]),
  ]);
  return serializeTeam(
    updated,
    counts.get(updated.id) ?? 0,
    links.get(updated.id) ?? { teamLeaderName: null, workRoles: [], eventSeries: [] },
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
