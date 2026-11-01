import { db } from '../database.js';
import type { Room } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { RoomPush, RoomUpdate, TableQuery } from '../schemas/index.js';

const logger = createLogger('room-service');

export interface RoomResponse {
  id: string;
  name: string;
  description: string;
  siteId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedRooms {
  items: RoomResponse[];
  total: number;
  page: number;
  limit: number;
}

function serializeRoom(room: Room): RoomResponse {
  return {
    id: room.id,
    name: room.name,
    description: room.description,
    siteId: room.site_id,
    organizationId: room.organization_id,
    createdAt: room.created_at.toISOString(),
    updatedAt: room.updated_at.toISOString(),
  };
}

/**
 * Lists rooms in an organization (optionally filtered by site) with
 * pagination and search.
 * @param organizationId - The organization ID.
 * @param query - Pagination and search parameters.
 * @param siteId - Optional site to filter rooms by.
 * @returns Paginated rooms.
 */
export async function listRooms(
  organizationId: string,
  query: TableQuery = {},
  siteId?: string,
): Promise<PaginatedRooms> {
  logger.trace('roomService.listRooms');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db.selectFrom('rooms').selectAll().where('organization_id', '=', organizationId);
  let countQuery = db
    .selectFrom('rooms')
    .select(db.fn.countAll().as('count'))
    .where('organization_id', '=', organizationId);

  if (siteId) {
    baseQuery = baseQuery.where('site_id', '=', siteId);
    countQuery = countQuery.where('site_id', '=', siteId);
  }

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
    items: rows.map(serializeRoom),
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Lists all rooms in an organization (no pagination, for dropdowns).
 * @param organizationId - The organization ID.
 * @param siteId - Optional site to filter rooms by.
 * @returns All rooms.
 */
export async function listAllRooms(
  organizationId: string,
  siteId?: string,
): Promise<RoomResponse[]> {
  logger.trace('roomService.listAllRooms');
  let query = db
    .selectFrom('rooms')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('name', 'asc');
  if (siteId) {
    query = query.where('site_id', '=', siteId);
  }
  const rows = await query.execute();
  return rows.map(serializeRoom);
}

/**
 * Gets a single room.
 * @param roomId - The room ID.
 * @returns The room.
 */
export async function getRoom(roomId: string): Promise<RoomResponse> {
  logger.trace('roomService.getRoom');
  const room = await db.selectFrom('rooms').selectAll().where('id', '=', roomId).executeTakeFirst();
  if (!room) {
    throw notFound(`Room ${roomId} not found!`);
  }
  return serializeRoom(room);
}

/**
 * Creates a new room.
 * @param data - The room data.
 * @returns The created room.
 */
export async function createRoom(data: RoomPush): Promise<RoomResponse> {
  logger.trace('roomService.createRoom');
  const room = await db
    .insertInto('rooms')
    .values({
      name: data.name,
      description: data.description ?? '',
      site_id: data.siteId,
      organization_id: data.organizationId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  return serializeRoom(room);
}

/**
 * Updates a room.
 * @param roomId - The room ID.
 * @param data - The fields to update.
 * @returns The updated room.
 */
export async function updateRoom(roomId: string, data: RoomUpdate): Promise<RoomResponse> {
  logger.trace('roomService.updateRoom');
  const updated = await db
    .updateTable('rooms')
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      updated_at: new Date(),
    })
    .where('id', '=', roomId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) {
    throw notFound(`Room ${roomId} not found!`);
  }
  return serializeRoom(updated);
}

/**
 * Deletes a room.
 * @param roomId - The room ID.
 */
export async function deleteRoom(roomId: string): Promise<void> {
  logger.trace('roomService.deleteRoom');
  const result = await db.deleteFrom('rooms').where('id', '=', roomId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Room ${roomId} not found!`);
  }
}
