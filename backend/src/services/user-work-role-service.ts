import { db } from '../database.js';
import type { UserCertification, UserWorkRole } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type {
  UserCertificationPush,
  UserCertificationUpdate,
  UserWorkRolePush,
  UserWorkRoleUpdate,
} from '../schemas/index.js';

const logger = createLogger('user-work-role-service');

export interface UserWorkRoleResponse {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  workRoleId: number;
  workRoleName: string;
  workRoleDescription: string;
  isQualified: boolean;
  notes: string;
  createdAt: string;
}

export interface UserCertificationResponse {
  id: number;
  userId: string;
  userName: string;
  certificationId: number;
  certificationName: string;
  certificationDescription: string;
  certificationDate: string | null;
  validUntilDate: string | null;
  createdAt: string;
}

function serializeUserWorkRole(
  row: UserWorkRole & {
    user_name: string;
    user_email: string;
    work_role_name: string;
    work_role_description: string;
  },
): UserWorkRoleResponse {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    workRoleId: row.work_role_id,
    workRoleName: row.work_role_name,
    workRoleDescription: row.work_role_description,
    isQualified: row.is_qualified,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
  };
}

function serializeUserCertification(
  row: UserCertification & {
    user_name: string;
    certification_name: string;
    certification_description: string;
  },
): UserCertificationResponse {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name,
    certificationId: row.certification_id,
    certificationName: row.certification_name,
    certificationDescription: row.certification_description,
    certificationDate: row.certification_date
      ? row.certification_date.toISOString().slice(0, 10)
      : null,
    validUntilDate: row.valid_until_date ? row.valid_until_date.toISOString().slice(0, 10) : null,
    createdAt: row.created_at.toISOString(),
  };
}

// --- User Work Roles ---

/**
 * Lists work roles a user is willing/qualified to fill.
 * @param organizationId - The organization ID (for scoping).
 * @param userId - The user ID.
 * @returns The user's work roles.
 */
export async function listUserWorkRoles(
  organizationId: string,
  userId: string,
): Promise<UserWorkRoleResponse[]> {
  logger.trace('userWorkRoleService.listUserWorkRoles');
  const rows = await db
    .selectFrom('user_work_roles')
    .innerJoin('users', 'users.id', 'user_work_roles.user_id')
    .innerJoin('work_roles', 'work_roles.id', 'user_work_roles.work_role_id')
    .select([
      'user_work_roles.id',
      'user_work_roles.user_id',
      'user_work_roles.work_role_id',
      'user_work_roles.is_qualified',
      'user_work_roles.notes',
      'user_work_roles.created_at',
      'users.name as user_name',
      'users.email as user_email',
      'work_roles.name as work_role_name',
      'work_roles.description as work_role_description',
    ])
    .where('user_work_roles.user_id', '=', userId)
    .where('work_roles.organization_id', '=', organizationId)
    .orderBy('work_roles.name', 'asc')
    .execute();
  return rows.map(serializeUserWorkRole);
}

/**
 * Lists all users willing/qualified for a specific work role in an organization.
 * @param organizationId - The organization ID.
 * @param workRoleId - The work role ID.
 * @returns The users assigned to the work role.
 */
export async function listWorkRoleUsers(
  organizationId: string,
  workRoleId: number,
): Promise<UserWorkRoleResponse[]> {
  logger.trace('userWorkRoleService.listWorkRoleUsers');
  const rows = await db
    .selectFrom('user_work_roles')
    .innerJoin('users', 'users.id', 'user_work_roles.user_id')
    .innerJoin('work_roles', 'work_roles.id', 'user_work_roles.work_role_id')
    .select([
      'user_work_roles.id',
      'user_work_roles.user_id',
      'user_work_roles.work_role_id',
      'user_work_roles.is_qualified',
      'user_work_roles.notes',
      'user_work_roles.created_at',
      'users.name as user_name',
      'users.email as user_email',
      'work_roles.name as work_role_name',
      'work_roles.description as work_role_description',
    ])
    .where('user_work_roles.work_role_id', '=', workRoleId)
    .where('work_roles.organization_id', '=', organizationId)
    .orderBy('users.name', 'asc')
    .execute();
  return rows.map(serializeUserWorkRole);
}

/**
 * Gets the current user's work roles (self-service).
 * @param organizationId - The organization ID.
 * @param userId - The current user ID.
 * @returns The user's work roles.
 */
export async function getMyWorkRoles(
  organizationId: string,
  userId: string,
): Promise<UserWorkRoleResponse[]> {
  return listUserWorkRoles(organizationId, userId);
}

/**
 * Adds a work role to a user (self-service or admin).
 * @param organizationId - The organization ID.
 * @param userId - The user ID.
 * @param data - The work role assignment data.
 * @returns The created user work role.
 */
export async function addUserWorkRole(
  organizationId: string,
  userId: string,
  data: UserWorkRolePush,
): Promise<UserWorkRoleResponse> {
  logger.trace('userWorkRoleService.addUserWorkRole');
  // Verify the work role exists and belongs to the organization.
  const workRole = await db
    .selectFrom('work_roles')
    .selectAll()
    .where('id', '=', data.workRoleId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!workRole) {
    throw notFound(`Work role ${data.workRoleId} not found!`);
  }

  const row = await db
    .insertInto('user_work_roles')
    .values({
      user_id: userId,
      work_role_id: data.workRoleId,
      is_qualified: data.isQualified ?? false,
      notes: data.notes ?? '',
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return getUserWorkRoleById(row.id);
}

/**
 * Updates a user's work role assignment (e.g. mark as qualified, update notes).
 * @param userWorkRoleId - The user work role ID.
 * @param data - The fields to update.
 * @returns The updated user work role.
 */
export async function updateUserWorkRole(
  userWorkRoleId: number,
  data: UserWorkRoleUpdate,
): Promise<UserWorkRoleResponse> {
  logger.trace('userWorkRoleService.updateUserWorkRole');
  const updated = await db
    .updateTable('user_work_roles')
    .set({
      ...(data.isQualified !== undefined ? { is_qualified: data.isQualified } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
    })
    .where('id', '=', userWorkRoleId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`User work role ${userWorkRoleId} not found!`);
  }
  return getUserWorkRoleById(updated.id);
}

/**
 * Removes a work role from a user.
 * @param userWorkRoleId - The user work role ID.
 */
export async function removeUserWorkRole(userWorkRoleId: number): Promise<void> {
  logger.trace('userWorkRoleService.removeUserWorkRole');
  const result = await db
    .deleteFrom('user_work_roles')
    .where('id', '=', userWorkRoleId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`User work role ${userWorkRoleId} not found!`);
  }
}

async function getUserWorkRoleById(id: number): Promise<UserWorkRoleResponse> {
  const row = await db
    .selectFrom('user_work_roles')
    .innerJoin('users', 'users.id', 'user_work_roles.user_id')
    .innerJoin('work_roles', 'work_roles.id', 'user_work_roles.work_role_id')
    .select([
      'user_work_roles.id',
      'user_work_roles.user_id',
      'user_work_roles.work_role_id',
      'user_work_roles.is_qualified',
      'user_work_roles.notes',
      'user_work_roles.created_at',
      'users.name as user_name',
      'users.email as user_email',
      'work_roles.name as work_role_name',
      'work_roles.description as work_role_description',
    ])
    .where('user_work_roles.id', '=', id)
    .executeTakeFirstOrThrow();
  return serializeUserWorkRole(row);
}

// --- User Certifications ---

/**
 * Lists certifications a user holds.
 * @param organizationId - The organization ID (for scoping).
 * @param userId - The user ID.
 * @returns The user's certifications.
 */
export async function listUserCertifications(
  organizationId: string,
  userId: string,
): Promise<UserCertificationResponse[]> {
  logger.trace('userWorkRoleService.listUserCertifications');
  const rows = await db
    .selectFrom('user_certifications')
    .innerJoin('users', 'users.id', 'user_certifications.user_id')
    .innerJoin('certifications', 'certifications.id', 'user_certifications.certification_id')
    .select([
      'user_certifications.id',
      'user_certifications.user_id',
      'user_certifications.certification_id',
      'user_certifications.certification_date',
      'user_certifications.valid_until_date',
      'user_certifications.created_at',
      'users.name as user_name',
      'certifications.name as certification_name',
      'certifications.description as certification_description',
    ])
    .where('user_certifications.user_id', '=', userId)
    .where('certifications.organization_id', '=', organizationId)
    .orderBy('certifications.name', 'asc')
    .execute();
  return rows.map(serializeUserCertification);
}

/**
 * Gets the current user's certifications (self-service).
 * @param organizationId - The organization ID.
 * @param userId - The current user ID.
 * @returns The user's certifications.
 */
export async function getMyCertifications(
  organizationId: string,
  userId: string,
): Promise<UserCertificationResponse[]> {
  return listUserCertifications(organizationId, userId);
}

/**
 * Adds a certification to a user (self-service or admin).
 * @param organizationId - The organization ID.
 * @param userId - The user ID.
 * @param data - The certification data.
 * @returns The created user certification.
 */
export async function addUserCertification(
  organizationId: string,
  userId: string,
  data: UserCertificationPush,
): Promise<UserCertificationResponse> {
  logger.trace('userWorkRoleService.addUserCertification');
  // Verify the certification exists and belongs to the organization.
  const cert = await db
    .selectFrom('certifications')
    .selectAll()
    .where('id', '=', data.certificationId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!cert) {
    throw notFound(`Certification ${data.certificationId} not found!`);
  }

  const row = await db
    .insertInto('user_certifications')
    .values({
      user_id: userId,
      certification_id: data.certificationId,
      certification_date: data.certificationDate ? new Date(data.certificationDate) : null,
      valid_until_date: data.validUntilDate ? new Date(data.validUntilDate) : null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return getUserCertificationById(row.id);
}

/**
 * Updates a user's certification dates (self-service or admin).
 * @param userCertificationId - The user certification ID.
 * @param data - The fields to update.
 * @returns The updated user certification.
 */
export async function updateUserCertification(
  userCertificationId: number,
  data: UserCertificationUpdate,
): Promise<UserCertificationResponse> {
  logger.trace('userWorkRoleService.updateUserCertification');
  const updated = await db
    .updateTable('user_certifications')
    .set({
      ...(data.certificationDate !== undefined
        ? { certification_date: data.certificationDate ? new Date(data.certificationDate) : null }
        : {}),
      ...(data.validUntilDate !== undefined
        ? { valid_until_date: data.validUntilDate ? new Date(data.validUntilDate) : null }
        : {}),
    })
    .where('id', '=', userCertificationId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`User certification ${userCertificationId} not found!`);
  }
  return getUserCertificationById(updated.id);
}

/**
 * Removes a certification from a user.
 * @param userCertificationId - The user certification ID.
 */
export async function removeUserCertification(userCertificationId: number): Promise<void> {
  logger.trace('userWorkRoleService.removeUserCertification');
  const result = await db
    .deleteFrom('user_certifications')
    .where('id', '=', userCertificationId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`User certification ${userCertificationId} not found!`);
  }
}

async function getUserCertificationById(id: number): Promise<UserCertificationResponse> {
  const row = await db
    .selectFrom('user_certifications')
    .innerJoin('users', 'users.id', 'user_certifications.user_id')
    .innerJoin('certifications', 'certifications.id', 'user_certifications.certification_id')
    .select([
      'user_certifications.id',
      'user_certifications.user_id',
      'user_certifications.certification_id',
      'user_certifications.certification_date',
      'user_certifications.valid_until_date',
      'user_certifications.created_at',
      'users.name as user_name',
      'certifications.name as certification_name',
      'certifications.description as certification_description',
    ])
    .where('user_certifications.id', '=', id)
    .executeTakeFirstOrThrow();
  return serializeUserCertification(row);
}
