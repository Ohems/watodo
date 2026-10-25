import { db } from '../database.js';
import { createLogger } from '../logger.js';
import { PERMISSION_DEFINITIONS } from '../permissions.js';

const logger = createLogger('permission-service');

/**
 * Inserts every permission from the registry, skipping ones that already
 * exist. Returns the number of newly inserted permissions.
 * @returns The number of newly inserted permissions.
 */
export async function seedPermissions(): Promise<number> {
  logger.trace('permissionService.seedPermissions');

  const inserted = await db
    .insertInto('permissions')
    .values(PERMISSION_DEFINITIONS)
    .onConflict(oc => oc.column('code').doNothing())
    .returning('code')
    .execute();

  return inserted.length;
}

/**
 * Effective permissions of a single user: the union of the permissions granted
 * by all roles the user holds in organizations the user belongs to. Role
 * assignments scoped to a team or event type are stored on the assignment and
 * included in API responses; they do not restrict the permission union because
 * endpoints do not carry a team/event-type context yet.
 * @param userId - The ID of the user.
 * @returns The effective permission codes for the user.
 */
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

/**
 * Effective permissions of a user within a single organization: the union of
 * the permissions granted by the roles the user holds in that organization.
 * The user must be a member of the organization for a role to count. Used for
 * checks that are scoped to one organization (e.g. editing its details).
 * @param userId - The ID of the user.
 * @param organizationId - The ID of the organization.
 * @returns The effective permission codes for the user in that organization.
 */
export async function getEffectivePermissionsForOrganization(
  userId: string,
  organizationId: string,
): Promise<string[]> {
  logger.trace('permissionService.getEffectivePermissionsForOrganization');

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
    .where('roles.organization_id', '=', organizationId)
    .execute();

  return [...new Set(rows.map(row => row.code))];
}

/**
 * Batched variant of getEffectivePermissions for lists of users.
 * @param userIds - The IDs of the users.
 * @returns A map from user ID to their effective permission codes.
 */
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
