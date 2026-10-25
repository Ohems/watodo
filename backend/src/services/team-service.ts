import { db } from '../database.js';
import type { Team } from '../db/types.js';
import { badRequest, isUniqueViolation, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { TableQuery, TeamMemberInput, TeamPush, TeamUpdate } from '../schemas/index.js';

const logger = createLogger('team-service');

export interface TeamMemberResponse {
  id: number;
  teamId: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
}

export interface TeamResponse {
  id: string;
  name: string;
  description: string;
  organizationId: string;
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

function serializeTeam(team: Team, memberCount: number): TeamResponse {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    organizationId: team.organization_id,
    memberCount,
    createdAt: team.created_at.toISOString(),
    updatedAt: team.updated_at.toISOString(),
  };
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

  const counts = await getMemberCounts(rows.map(r => r.id));
  const items = rows.map(row => serializeTeam(row, counts.get(row.id) ?? 0));

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
  const counts = await getMemberCounts([team.id]);
  return serializeTeam(team, counts.get(team.id) ?? 0);
}

/**
 * Creates a new team.
 * @param data - The team data.
 * @returns The created team.
 */
export async function createTeam(data: TeamPush): Promise<TeamResponse> {
  logger.trace('teamService.createTeam');
  const team = await db
    .insertInto('teams')
    .values({
      name: data.name,
      description: data.description ?? '',
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeTeam(team, 0);
}

/**
 * Updates a team.
 * @param teamId - The team ID.
 * @param data - The fields to update.
 * @returns The updated team.
 */
export async function updateTeam(teamId: string, data: TeamUpdate): Promise<TeamResponse> {
  logger.trace('teamService.updateTeam');
  const updated = await db
    .updateTable('teams')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', teamId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Team ${teamId} not found!`);
  }
  const counts = await getMemberCounts([updated.id]);
  return serializeTeam(updated, counts.get(updated.id) ?? 0);
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
      .values({ team_id: teamId, user_id: data.userId })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: member.id,
      teamId: member.team_id,
      userId: member.user_id,
      userName: user.name,
      userEmail: user.email,
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
