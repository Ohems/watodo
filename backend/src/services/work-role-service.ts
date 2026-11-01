import { db } from '../database.js';
import type { CertificationWorkRole, WorkRole } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { TableQuery, WorkRolePush, WorkRoleUpdate } from '../schemas/index.js';

const logger = createLogger('work-role-service');

export interface WorkRoleResponse {
  id: number;
  name: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkRoleDetailResponse extends WorkRoleResponse {
  /** Certifications considered mandatory for this work role. */
  requiredCertifications: CertificationResponse[];
  /** Users willing/qualified to fill this role. */
  users: UserWorkRoleResponse[];
}

export interface CertificationResponse {
  id: number;
  name: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWorkRoleResponse {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  workRoleId: number;
  isQualified: boolean;
  notes: string;
  createdAt: string;
}

export interface PaginatedWorkRoles {
  items: WorkRoleResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeWorkRole(role: WorkRole): WorkRoleResponse {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    organizationId: role.organization_id,
    createdAt: role.created_at.toISOString(),
    updatedAt: role.updated_at.toISOString(),
  };
}

/**
 * Lists work roles in an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated work roles.
 */
export async function listWorkRoles(
  organizationId: string,
  query: TableQuery = {},
): Promise<PaginatedWorkRoles> {
  logger.trace('workRoleService.listWorkRoles');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db
    .selectFrom('work_roles')
    .selectAll()
    .where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('work_roles')
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

  return {
    items: rows.map(serializeWorkRole),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Lists all work roles in an organization (no pagination, for dropdowns).
 * @param organizationId - The organization ID.
 * @returns All work roles.
 */
export async function listAllWorkRoles(organizationId: string): Promise<WorkRoleResponse[]> {
  logger.trace('workRoleService.listAllWorkRoles');
  const rows = await db
    .selectFrom('work_roles')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(serializeWorkRole);
}

/**
 * Gets a single work role with its required certifications and assigned users.
 * @param workRoleId - The work role ID.
 * @returns The work role detail.
 */
export async function getWorkRole(workRoleId: number): Promise<WorkRoleDetailResponse> {
  logger.trace('workRoleService.getWorkRole');
  const role = await db
    .selectFrom('work_roles')
    .selectAll()
    .where('id', '=', workRoleId)
    .executeTakeFirst();
  if (!role) {
    throw notFound(`Work role ${workRoleId} not found!`);
  }

  // Required certifications for this work role.
  const certRows = await db
    .selectFrom('certification_work_roles')
    .innerJoin('certifications', 'certifications.id', 'certification_work_roles.certification_id')
    .selectAll('certifications')
    .where('certification_work_roles.work_role_id', '=', workRoleId)
    .orderBy('certifications.name', 'asc')
    .execute();

  // Users assigned to this work role.
  const userRows = await db
    .selectFrom('user_work_roles')
    .innerJoin('users', 'users.id', 'user_work_roles.user_id')
    .select([
      'user_work_roles.id',
      'user_work_roles.user_id',
      'user_work_roles.work_role_id',
      'user_work_roles.is_qualified',
      'user_work_roles.notes',
      'user_work_roles.created_at',
      'users.name as user_name',
      'users.email as user_email',
    ])
    .where('user_work_roles.work_role_id', '=', workRoleId)
    .orderBy('users.name', 'asc')
    .execute();

  return {
    ...serializeWorkRole(role),
    requiredCertifications: certRows.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      organizationId: c.organization_id,
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
    })),
    users: userRows.map(u => ({
      id: u.id,
      userId: u.user_id,
      userName: u.user_name,
      userEmail: u.user_email,
      workRoleId: u.work_role_id,
      isQualified: u.is_qualified,
      notes: u.notes,
      createdAt: u.created_at.toISOString(),
    })),
  };
}

/**
 * Creates a new work role.
 * @param data - The work role data.
 * @returns The created work role.
 */
export async function createWorkRole(data: WorkRolePush): Promise<WorkRoleResponse> {
  logger.trace('workRoleService.createWorkRole');
  const role = await db
    .insertInto('work_roles')
    .values({
      name: data.name,
      description: data.description ?? '',
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeWorkRole(role);
}

/**
 * Updates a work role.
 * @param workRoleId - The work role ID.
 * @param data - The fields to update.
 * @returns The updated work role.
 */
export async function updateWorkRole(
  workRoleId: number,
  data: WorkRoleUpdate,
): Promise<WorkRoleResponse> {
  logger.trace('workRoleService.updateWorkRole');
  const updated = await db
    .updateTable('work_roles')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', workRoleId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Work role ${workRoleId} not found!`);
  }
  return serializeWorkRole(updated);
}

/**
 * Deletes a work role.
 * @param workRoleId - The work role ID.
 */
export async function deleteWorkRole(workRoleId: number): Promise<void> {
  logger.trace('workRoleService.deleteWorkRole');
  const result = await db.deleteFrom('work_roles').where('id', '=', workRoleId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Work role ${workRoleId} not found!`);
  }
}

/**
 * Links a certification to a work role (making it mandatory for that role).
 * @param workRoleId - The work role ID.
 * @param certificationId - The certification ID.
 */
export async function addCertificationToWorkRole(
  workRoleId: number,
  certificationId: number,
): Promise<void> {
  logger.trace('workRoleService.addCertificationToWorkRole');
  await db
    .insertInto('certification_work_roles')
    .values({ work_role_id: workRoleId, certification_id: certificationId })
    .onConflict(oc => oc.doNothing())
    .execute();
}

/**
 * Removes a certification link from a work role.
 * @param workRoleId - The work role ID.
 * @param certificationId - The certification ID.
 */
export async function removeCertificationFromWorkRole(
  workRoleId: number,
  certificationId: number,
): Promise<void> {
  logger.trace('workRoleService.removeCertificationFromWorkRole');
  const result = await db
    .deleteFrom('certification_work_roles')
    .where('work_role_id', '=', workRoleId)
    .where('certification_id', '=', certificationId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Certification link not found!`);
  }
}

/**
 * Lists the required certifications for a work role.
 * @param workRoleId - The work role ID.
 * @returns The required certifications.
 */
export async function listWorkRoleCertifications(
  workRoleId: number,
): Promise<CertificationResponse[]> {
  logger.trace('workRoleService.listWorkRoleCertifications');
  const rows = await db
    .selectFrom('certification_work_roles')
    .innerJoin('certifications', 'certifications.id', 'certification_work_roles.certification_id')
    .selectAll('certifications')
    .where('certification_work_roles.work_role_id', '=', workRoleId)
    .orderBy('certifications.name', 'asc')
    .execute();
  return rows.map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    organizationId: c.organization_id,
    createdAt: c.created_at.toISOString(),
    updatedAt: c.updated_at.toISOString(),
  }));
}

export type { CertificationWorkRole };
