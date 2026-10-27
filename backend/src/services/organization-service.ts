import { db } from '../database.js';
import type { Organization, User } from '../db/types.js';
import { forbidden, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import { hasPermission, PERMISSIONS } from '../permissions.js';
import type { OrganizationUpdate } from '../schemas/index.js';
import { getEffectivePermissionsForOrganization } from './permission-service.js';

const logger = createLogger('organization-service');

export interface OrganizationResponse {
  id: string;
  name: string;
  description: string;
  defaultTimezone: string;
  createdAt: string;
  updatedAt: string;
}

function serializeOrganization(organization: Organization): OrganizationResponse {
  return {
    id: organization.id,
    name: organization.name,
    description: organization.description,
    defaultTimezone: organization.default_timezone,
    createdAt: organization.created_at.toISOString(),
    updatedAt: organization.updated_at.toISOString(),
  };
}

/**
 * Lists the organizations a user belongs to.
 * @param userId - The ID of the user.
 * @returns The organizations the user belongs to.
 */
export async function listOrganizationsForUser(userId: string): Promise<OrganizationResponse[]> {
  logger.trace('organizationService.listOrganizationsForUser');
  const rows = await db
    .selectFrom('user_organizations')
    .innerJoin('organizations', 'organizations.id', 'user_organizations.organization_id')
    .selectAll('organizations')
    .where('user_organizations.user_id', '=', userId)
    .orderBy('organizations.name', 'asc')
    .execute();
  return rows.map(serializeOrganization);
}

/**
 * Throws when the user is not a member of the organization. Membership is
 * checked with a 404 (not a 403) so the existence of other organizations is
 * not leaked to non-members.
 */
async function getMembershipOrThrow(userId: string, organizationId: string): Promise<void> {
  const membership = await db
    .selectFrom('user_organizations')
    .select('id')
    .where('user_id', '=', userId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!membership) {
    throw notFound(`Organization ${organizationId} not found!`);
  }
}

/**
 * Gets a single organization. Only members of the organization may see it.
 * @param organizationId - The ID of the organization.
 * @param userId - The ID of the requesting user.
 * @returns The organization.
 */
export async function getOrganizationForUser(
  organizationId: string,
  userId: string,
): Promise<OrganizationResponse> {
  logger.trace('organizationService.getOrganizationForUser');
  await getMembershipOrThrow(userId, organizationId);

  const organization = await db
    .selectFrom('organizations')
    .selectAll()
    .where('id', '=', organizationId)
    .executeTakeFirstOrThrow();
  return serializeOrganization(organization);
}

/**
 * Updates the details of an organization. Allowed for members holding the
 * organization:write permission in that organization; the admin permission
 * bypasses the check.
 * @param organizationId - The ID of the organization.
 * @param userId - The ID of the requesting user.
 * @param data - The fields to update.
 * @returns The updated organization.
 */
export async function updateOrganization(
  organizationId: string,
  userId: string,
  data: OrganizationUpdate,
): Promise<OrganizationResponse> {
  logger.trace('organizationService.updateOrganization');
  await getMembershipOrThrow(userId, organizationId);

  const permissions = await getEffectivePermissionsForOrganization(userId, organizationId);
  if (!hasPermission(permissions, PERMISSIONS.ORGANIZATION_WRITE)) {
    throw forbidden('You do not have permission to edit this organization!');
  }

  const updated = await db
    .updateTable('organizations')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.defaultTimezone !== undefined ? { default_timezone: data.defaultTimezone } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', organizationId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return serializeOrganization(updated);
}

// --- Organization users ---

export interface OrganizationUserResponse {
  id: string;
  name: string;
  email: string;
  description: string;
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  state: string;
  createdAt: string;
}

export interface PaginatedOrgUsers {
  items: OrganizationUserResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeOrganizationUser(user: User): OrganizationUserResponse {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    description: user.description,
    isEmployed: user.is_employed,
    isSuspended: user.is_suspended,
    isBlocked: user.is_blocked,
    state: user.state,
    createdAt: user.created_at.toISOString(),
  };
}

/**
 * Lists the users of an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated users.
 */
export async function listOrganizationUsers(
  organizationId: string,
  query: { page?: number; limit?: number; search?: string } = {},
): Promise<PaginatedOrgUsers> {
  logger.trace('organizationService.listOrganizationUsers');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db
    .selectFrom('user_organizations')
    .innerJoin('users', 'users.id', 'user_organizations.user_id')
    .selectAll('users')
    .where('user_organizations.organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('user_organizations')
    .innerJoin('users', 'users.id', 'user_organizations.user_id')
    .select(db.fn.countAll().as('count'))
    .where('user_organizations.organization_id', '=', organizationId);

  if (search) {
    baseQuery = baseQuery.where('users.name', 'ilike', `%${search}%`);
    countQuery = countQuery.where('users.name', 'ilike', `%${search}%`);
  }

  const [rows, countRow] = await Promise.all([
    baseQuery
      .orderBy('users.name', 'asc')
      .limit(limit)
      .offset(page * limit)
      .execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  return {
    items: rows.map(serializeOrganizationUser),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Gets a single user of an organization. Returns 404 when the user is not a
 * member of the organization, so the existence of users is not leaked.
 * @param organizationId - The organization ID.
 * @param userId - The user ID.
 * @returns The organization user.
 */
export async function getOrganizationUser(
  organizationId: string,
  userId: string,
): Promise<OrganizationUserResponse> {
  logger.trace('organizationService.getOrganizationUser');
  const user = await db
    .selectFrom('user_organizations')
    .innerJoin('users', 'users.id', 'user_organizations.user_id')
    .selectAll('users')
    .where('user_organizations.organization_id', '=', organizationId)
    .where('users.id', '=', userId)
    .executeTakeFirst();

  if (!user) {
    throw notFound(`User ${userId} not found in organization ${organizationId}!`);
  }

  return serializeOrganizationUser(user);
}
