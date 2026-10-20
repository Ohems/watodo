import { db } from '../database.js';
import { createLogger } from '../logger.js';

const logger = createLogger('permission-service');

// Effective permissions of a single user: the union of the permissions granted
// by all roles the user holds in organizations the user belongs to. Role
// assignments scoped to a team or event type are stored on the assignment and
// included in API responses; they do not restrict the permission union because
// endpoints do not carry a team/event-type context yet.
export async function getEffectivePermissions(userId: string): Promise<string[]> {
  logger.trace('permissionService.getEffectivePermissions');

  const rows = await db
    .selectFrom('user_roles')
    .innerJoin('roles', 'roles.id', 'user_roles.role_id')
    .innerJoin('role_permissions', 'role_permissions.role_id', 'roles.id')
    .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
    .innerJoin('user_organizations', join =>
      join
        .onRef('user_organizations.organization_id', '=', 'roles.organization_id')
        .on('user_organizations.user_id', '=', userId),
    )
    .select('permissions.code')
    .where('user_roles.user_id', '=', userId)
    .execute();

  return [...new Set(rows.map(row => row.code))];
}

// Batched variant of getEffectivePermissions for lists of users.
export async function getEffectivePermissionsForUsers(
  userIds: string[],
): Promise<Map<string, string[]>> {
  logger.trace('permissionService.getEffectivePermissionsForUsers');

  const result = new Map<string, string[]>();
  if (userIds.length === 0) return result;

  const rows = await db
    .selectFrom('user_roles')
    .innerJoin('roles', 'roles.id', 'user_roles.role_id')
    .innerJoin('role_permissions', 'role_permissions.role_id', 'roles.id')
    .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
    .innerJoin('user_organizations', join =>
      join
        .onRef('user_organizations.organization_id', '=', 'roles.organization_id')
        .onRef('user_organizations.user_id', '=', 'user_roles.user_id'),
    )
    .select(['user_roles.user_id', 'permissions.code'])
    .where('user_roles.user_id', 'in', userIds)
    .execute();

  for (const row of rows) {
    const list = result.get(row.user_id) ?? [];
    if (!list.includes(row.code)) list.push(row.code);
    result.set(row.user_id, list);
  }

  return result;
}
