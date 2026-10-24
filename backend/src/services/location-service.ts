import { db } from '../database.js';
import type { Location } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { LocationPush, LocationUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('location-service');

export interface LocationResponse {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedLocations {
  items: LocationResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeLocation(location: Location): LocationResponse {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    organizationId: location.organization_id,
    createdAt: location.created_at.toISOString(),
    updatedAt: location.updated_at.toISOString(),
  };
}

/**
 * Lists locations in an organization with pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @returns Paginated locations.
 */
export async function listLocations(
  organizationId: string,
  query: TableQuery = {},
): Promise<PaginatedLocations> {
  logger.trace('locationService.listLocations');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db
    .selectFrom('locations')
    .selectAll()
    .where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('locations')
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
    items: rows.map(serializeLocation),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Lists all locations in an organization (no pagination, for dropdowns).
 * @param organizationId - The organization ID.
 * @returns All locations.
 */
export async function listAllLocations(organizationId: string): Promise<LocationResponse[]> {
  logger.trace('locationService.listAllLocations');
  const rows = await db
    .selectFrom('locations')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc')
    .execute();
  return rows.map(serializeLocation);
}

/**
 * Gets a single location.
 * @param locationId - The location ID.
 * @returns The location.
 */
export async function getLocation(locationId: string): Promise<LocationResponse> {
  logger.trace('locationService.getLocation');
  const location = await db
    .selectFrom('locations')
    .selectAll()
    .where('id', '=', locationId)
    .executeTakeFirst();
  if (!location) {
    throw notFound(`Location ${locationId} not found!`);
  }
  return serializeLocation(location);
}

/**
 * Creates a new location.
 * @param data - The location data.
 * @returns The created location.
 */
export async function createLocation(data: LocationPush): Promise<LocationResponse> {
  logger.trace('locationService.createLocation');
  const location = await db
    .insertInto('locations')
    .values({
      name: data.name,
      description: data.description ?? '',
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeLocation(location);
}

/**
 * Updates a location.
 * @param locationId - The location ID.
 * @param data - The fields to update.
 * @returns The updated location.
 */
export async function updateLocation(
  locationId: string,
  data: LocationUpdate,
): Promise<LocationResponse> {
  logger.trace('locationService.updateLocation');
  const updated = await db
    .updateTable('locations')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', locationId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Location ${locationId} not found!`);
  }
  return serializeLocation(updated);
}

/**
 * Deletes a location.
 * @param locationId - The location ID.
 */
export async function deleteLocation(locationId: string): Promise<void> {
  logger.trace('locationService.deleteLocation');
  const result = await db.deleteFrom('locations').where('id', '=', locationId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Location ${locationId} not found!`);
  }
}
