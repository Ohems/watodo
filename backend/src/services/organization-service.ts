import { db } from '../database.js';
import { createLogger } from '../logger.js';

const logger = createLogger('organization-service');

export interface OrganizationResponse {
  id: string;
  name: string;
  defaultTimezone: string;
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
    .select(['organizations.id', 'organizations.name', 'organizations.default_timezone'])
    .where('user_organizations.user_id', '=', userId)
    .orderBy('organizations.name', 'asc')
    .execute();
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    defaultTimezone: row.default_timezone,
  }));
}
