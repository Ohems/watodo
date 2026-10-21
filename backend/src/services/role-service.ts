import type { Kysely, Transaction } from 'kysely';
import { db } from '../database.js';
import type { Database, Role, UserRole } from '../db/types.js';
import { httpError, isUniqueViolation } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { RoleAssignmentInput, RolePush, RoleUpdate } from '../schemas/index.js';

const logger = createLogger('role-service');

export interface RoleWithPermissions extends Role {
  permissions: string[];
}

export interface RoleAssignmentWithUser extends UserRole {
  user_name: string;
  user_email: string;
}

async function getOrganizationOrThrow(organizationId: string): Promise<void> {
  const organization = await db
    .selectFrom('organizations')
    .select('id')
    .where('id', '=', organizationId)
    .executeTakeFirst();
  if (!organization) {
    throw httpError(404, `Organization ${organizationId} not found!`);
  }
}

async function getRoleInOrganizationOrThrow(organizationId: string, roleId: number): Promise<Role> {
  const role = await db
    .selectFrom('roles')
    .selectAll()
    .where('id', '=', roleId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!role) {
    throw httpError(404, `Role ${roleId} not found in organization ${organizationId}!`);
  }
  return role;
}

async function resolvePermissionIds(codes: string[]): Promise<number[]> {
  if (codes.length === 0) return [];
  const rows = await db
    .selectFrom('permissions')
    .select(['id', 'code'])
    .where('code', 'in', codes)
    .execute();
  const found = new Set(rows.map(row => row.code));
  const unknown = codes.filter(code => !found.has(code));
  if (unknown.length > 0) {
    throw httpError(400, `Unknown permissions: ${unknown.join(', ')}`);
  }
  return rows.map(row => row.id);
}

async function attachPermissions(
  executor: Kysely<Database> | Transaction<Database>,
  roles: Role[],
): Promise<RoleWithPermissions[]> {
  if (roles.length === 0) return [];
  const rows = await executor
    .selectFrom('role_permissions')
    .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
    .select(['role_permissions.role_id', 'permissions.code'])
    .where(
      'role_permissions.role_id',
      'in',
      roles.map(role => role.id),
    )
    .execute();

  const byRole = new Map<number, string[]>();
  for (const row of rows) {
    const list = byRole.get(row.role_id) ?? [];
    list.push(row.code);
    byRole.set(row.role_id, list);
  }

  return roles.map(role => ({ ...role, permissions: byRole.get(role.id) ?? [] }));
}

async function replaceRolePermissions(roleId: number, permissionIds: number[]): Promise<void> {
  await db.deleteFrom('role_permissions').where('role_id', '=', roleId).execute();
  if (permissionIds.length === 0) return;
  await db
    .insertInto('role_permissions')
    .values(permissionIds.map(permissionId => ({ role_id: roleId, permission_id: permissionId })))
    .execute();
}

export async function listRoles(organizationId: string): Promise<RoleWithPermissions[]> {
  logger.trace('roleService.listRoles');
  await getOrganizationOrThrow(organizationId);

  const roles = await db
    .selectFrom('roles')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .execute();

  return attachPermissions(db, roles);
}

export async function createRole(
  organizationId: string,
  data: RolePush,
): Promise<RoleWithPermissions> {
  logger.trace('roleService.createRole');
  await getOrganizationOrThrow(organizationId);
  const permissionIds = await resolvePermissionIds(data.permissions ?? []);

  return db.transaction().execute(async tx => {
    const role = await tx
      .insertInto('roles')
      .values({
        organization_id: organizationId,
        name: data.name,
        description: data.description ?? '',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (permissionIds.length > 0) {
      await tx
        .insertInto('role_permissions')
        .values(
          permissionIds.map(permissionId => ({ role_id: role.id, permission_id: permissionId })),
        )
        .execute();
    }

    const [result] = await attachPermissions(tx, [role]);
    return result;
  });
}

export async function updateRole(
  organizationId: string,
  roleId: number,
  data: RoleUpdate,
): Promise<RoleWithPermissions> {
  logger.trace('roleService.updateRole');
  const role = await getRoleInOrganizationOrThrow(organizationId, roleId);
  const permissionIds =
    data.permissions !== undefined ? await resolvePermissionIds(data.permissions) : undefined;

  return db.transaction().execute(async tx => {
    await tx
      .updateTable('roles')
      .set({
        name: data.name ?? role.name,
        description: data.description ?? role.description,
        updated_at: new Date(),
      })
      .where('id', '=', role.id)
      .execute();

    if (permissionIds !== undefined) {
      await replaceRolePermissions(role.id, permissionIds);
    }

    const updated = await tx
      .selectFrom('roles')
      .selectAll()
      .where('id', '=', role.id)
      .executeTakeFirstOrThrow();
    const [result] = await attachPermissions(tx, [updated]);
    return result;
  });
}

export async function deleteRole(organizationId: string, roleId: number): Promise<void> {
  logger.trace('roleService.deleteRole');
  await getRoleInOrganizationOrThrow(organizationId, roleId);
  await db.deleteFrom('roles').where('id', '=', roleId).execute();
}

export async function listAssignments(
  organizationId: string,
  roleId: number,
): Promise<RoleAssignmentWithUser[]> {
  logger.trace('roleService.listAssignments');
  await getRoleInOrganizationOrThrow(organizationId, roleId);

  return db
    .selectFrom('user_roles')
    .innerJoin('users', 'users.id', 'user_roles.user_id')
    .selectAll('user_roles')
    .select(['users.name as user_name', 'users.email as user_email'])
    .where('user_roles.role_id', '=', roleId)
    .orderBy('user_roles.id', 'asc')
    .execute();
}

export async function assignRole(
  organizationId: string,
  roleId: number,
  data: RoleAssignmentInput,
): Promise<UserRole> {
  logger.trace('roleService.assignRole');
  await getRoleInOrganizationOrThrow(organizationId, roleId);

  const user = await db
    .selectFrom('users')
    .select('id')
    .where('id', '=', data.userId)
    .executeTakeFirst();
  if (!user) {
    throw httpError(404, `User ${data.userId} not found!`);
  }

  const membership = await db
    .selectFrom('user_organizations')
    .select('id')
    .where('user_id', '=', data.userId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!membership) {
    throw httpError(400, 'User is not a member of this organization!');
  }

  if (data.teamId) {
    const team = await db
      .selectFrom('teams')
      .select('id')
      .where('id', '=', data.teamId)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!team) {
      throw httpError(400, 'Team not found in this organization!');
    }
  }

  if (data.eventTypeId) {
    const eventType = await db
      .selectFrom('event_types')
      .innerJoin('calendars', 'calendars.id', 'event_types.calendar_id')
      .select('event_types.id')
      .where('event_types.id', '=', data.eventTypeId)
      .where('calendars.organization_id', '=', organizationId)
      .executeTakeFirst();
    if (!eventType) {
      throw httpError(400, 'Event type not found in this organization!');
    }
  }

  try {
    return await db
      .insertInto('user_roles')
      .values({
        user_id: data.userId,
        role_id: roleId,
        team_id: data.teamId ?? null,
        event_type_id: data.eventTypeId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (error) {
    // The unique constraint treats NULL scope values as equal.
    if (isUniqueViolation(error)) {
      throw httpError(400, 'User already has this role with the same scope!');
    }
    throw error;
  }
}

export async function unassignRole(
  organizationId: string,
  roleId: number,
  assignmentId: number,
): Promise<void> {
  logger.trace('roleService.unassignRole');
  await getRoleInOrganizationOrThrow(organizationId, roleId);

  const result = await db
    .deleteFrom('user_roles')
    .where('id', '=', assignmentId)
    .where('role_id', '=', roleId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw httpError(404, `Assignment ${assignmentId} not found!`);
  }
}
