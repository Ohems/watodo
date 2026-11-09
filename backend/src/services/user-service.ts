import { db } from '../database.js';
import type { User } from '../db/types.js';
import { badRequest, isUniqueViolation } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { UserListQuery, UserPush, UserQuery, UserSelfUpdate } from '../schemas/index.js';
import { usersWithAbsenceInRange } from './absence-service.js';
import { getEffectivePermissions, getEffectivePermissionsForUsers } from './permission-service.js';

const logger = createLogger('user-service');

export type UserWithPermissions = User & { permissions: string[] };

/**
 * The API representation of a user: camelCase fields (including the optional
 * phoneNumber), ISO timestamps and the user's effective permissions.
 */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  description: string;
  state: string;
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  phoneNumber: string | null;
  language: string;
  weekStart: string;
  dateFormat: string;
  timeFormat: string;
  createdAt: string;
  updatedAt: string;
  permissions: string[];
}

export function serializeUser(user: User, permissions: string[]): UserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    description: user.description,
    state: user.state,
    isEmployed: user.is_employed,
    isSuspended: user.is_suspended,
    isBlocked: user.is_blocked,
    phoneNumber: user.phone_number,
    language: user.language,
    weekStart: user.week_start,
    dateFormat: user.date_format,
    timeFormat: user.time_format,
    createdAt: user.created_at.toISOString(),
    updatedAt: user.updated_at.toISOString(),
    permissions,
  };
}

function throwNotFound(userId: string): never {
  throw new Error(`User ${userId} not found!`);
}

export async function getUsers(options: UserQuery = {}): Promise<UserWithPermissions[]> {
  logger.trace('userService.getUsers');

  const page = options.page ?? 0;
  const limit = options.limit ?? 50;
  const active = options.active ?? (options.archived === undefined ? true : !options.archived);

  let query = db.selectFrom('users').selectAll().orderBy('name', 'asc');

  if (active) {
    query = query.where('state', '=', 'active');
  } else {
    query = query.where('state', '!=', 'active');
  }

  const users = await query
    .limit(limit)
    .offset(limit * page)
    .execute();
  const permissions = await getEffectivePermissionsForUsers(users.map(user => user.id));

  return users.map(user => ({ ...user, permissions: permissions.get(user.id) ?? [] }));
}

export async function getUser(userId: string): Promise<UserWithPermissions> {
  logger.trace('userService.getUser');

  const user = await db.selectFrom('users').selectAll().where('id', '=', userId).executeTakeFirst();

  if (!user) {
    throwNotFound(userId);
  }

  const permissions = await getEffectivePermissions(userId);
  return { ...user, permissions };
}

export interface UserListItem {
  id: string;
  name: string;
  /** True when the user has an absence overlapping the requested range. */
  hasAbsence: boolean;
}

/**
 * Simple user list (id + name). When both `start` and `end` are given, each
 * entry also carries `hasAbsence`, true when the user has an absence
 * overlapping that instant range (used to mark unavailable users in the
 * assignment dropdown).
 */
export async function getUserList(query: UserListQuery = {}): Promise<UserListItem[]> {
  logger.trace('userService.getUserList');

  const users = await db
    .selectFrom('users')
    .select(['id', 'name'])
    .orderBy('name', 'asc')
    .execute();
  let absentIds = new Set<string>();
  if (query.start && query.end) {
    absentIds = await usersWithAbsenceInRange(
      users.map(user => user.id),
      new Date(query.start),
      new Date(query.end),
    );
  }
  return users.map(user => ({ id: user.id, name: user.name, hasAbsence: absentIds.has(user.id) }));
}

export async function updateUser(userId: string, data: UserPush): Promise<UserWithPermissions> {
  logger.trace('userService.updateUser');

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.state !== undefined) updateData.state = data.state;

  updateData.updated_at = new Date();

  const result = await db
    .updateTable('users')
    .set(updateData)
    .where('id', '=', userId)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throwNotFound(userId);
  }

  const permissions = await getEffectivePermissions(userId);
  return { ...result, permissions };
}

/**
 * Updates the personal information of a user's own account. Only the
 * self-service fields (name, email, description) are accepted; anything else
 * is stripped by the schema before it reaches this function.
 */
export async function updateUserProfile(
  userId: string,
  data: UserSelfUpdate,
): Promise<UserResponse> {
  logger.trace('userService.updateUserProfile');

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.phoneNumber !== undefined) updateData.phone_number = data.phoneNumber;
  if (data.language !== undefined) updateData.language = data.language;
  if (data.weekStart !== undefined) updateData.week_start = data.weekStart;
  if (data.dateFormat !== undefined) updateData.date_format = data.dateFormat;
  if (data.timeFormat !== undefined) updateData.time_format = data.timeFormat;

  updateData.updated_at = new Date();

  let result: User | undefined;
  try {
    result = await db
      .updateTable('users')
      .set(updateData)
      .where('id', '=', userId)
      .returningAll()
      .executeTakeFirst();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest('A user with this email address already exists!');
    }
    throw error;
  }

  if (!result) {
    throwNotFound(userId);
  }

  const permissions = await getEffectivePermissions(userId);
  return serializeUser(result, permissions);
}

export async function deleteUser(userId: string): Promise<void> {
  logger.trace('userService.deleteUser');

  const result = await db.deleteFrom('users').where('id', '=', userId).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throwNotFound(userId);
  }
}
