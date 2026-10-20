import { db } from '../database.js';
import type { User } from '../db/types.js';
import { createLogger } from '../logger.js';
import type { UserPush, UserQuery } from '../schemas/index.js';
import { getEffectivePermissions, getEffectivePermissionsForUsers } from './permission-service.js';

const logger = createLogger('user-service');

export type UserWithPermissions = User & { permissions: string[] };

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

export async function getUserList() {
  logger.trace('userService.getUserList');

  return db.selectFrom('users').select(['id', 'name']).orderBy('name', 'asc').execute();
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

export async function deleteUser(userId: string): Promise<void> {
  logger.trace('userService.deleteUser');

  const result = await db.deleteFrom('users').where('id', '=', userId).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throwNotFound(userId);
  }
}
