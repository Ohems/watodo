import { db } from '../database.js';
import type { Site } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { SitePush, SiteUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('site-service');

export interface SiteResponse {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedSites {
  items: SiteResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeSite(site: Site): SiteResponse {
  return {
    id: site.id,
    name: site.name,
    description: site.description,
    address: site.address,
    organizationId: site.organization_id,
    createdAt: site.created_at.toISOString(),
    updatedAt: site.updated_at.toISOString(),
  };
}

/**
 * Lists sites in an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated sites.
 */
export async function listSites(
  organizationId: string,
  query: TableQuery = {},
): Promise<PaginatedSites> {
  logger.trace('siteService.listSites');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db.selectFrom('sites').selectAll().where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('sites')
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
    items: rows.map(serializeSite),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Lists all sites in an organization (no pagination, for dropdowns).
 * @param organizationId - The organization ID.
 * @returns All sites.
 */
export async function listAllSites(organizationId: string): Promise<SiteResponse[]> {
  logger.trace('siteService.listAllSites');
  const rows = await db
    .selectFrom('sites')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(serializeSite);
}

/**
 * Gets a single site.
 * @param siteId - The site ID.
 * @returns The site.
 */
export async function getSite(siteId: string): Promise<SiteResponse> {
  logger.trace('siteService.getSite');
  const site = await db.selectFrom('sites').selectAll().where('id', '=', siteId).executeTakeFirst();
  if (!site) {
    throw notFound(`Site ${siteId} not found!`);
  }
  return serializeSite(site);
}

/**
 * Creates a new site.
 * @param data - The site data.
 * @returns The created site.
 */
export async function createSite(data: SitePush): Promise<SiteResponse> {
  logger.trace('siteService.createSite');
  const site = await db
    .insertInto('sites')
    .values({
      name: data.name,
      description: data.description ?? null,
      address: data.address ?? null,
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeSite(site);
}

/**
 * Updates a site.
 * @param siteId - The site ID.
 * @param data - The fields to update.
 * @returns The updated site.
 */
export async function updateSite(siteId: string, data: SiteUpdate): Promise<SiteResponse> {
  logger.trace('siteService.updateSite');
  const updated = await db
    .updateTable('sites')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.address !== undefined ? { address: data.address } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', siteId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Site ${siteId} not found!`);
  }
  return serializeSite(updated);
}

/**
 * Deletes a site (cascades to its rooms).
 * @param siteId - The site ID.
 */
export async function deleteSite(siteId: string): Promise<void> {
  logger.trace('siteService.deleteSite');
  const result = await db.deleteFrom('sites').where('id', '=', siteId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Site ${siteId} not found!`);
  }
}
