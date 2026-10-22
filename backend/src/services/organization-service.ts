import { db } from '../database.js';
import type { Organization } from '../db/types.js';
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
