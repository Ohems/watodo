import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  organizationParamsSchema,
  roomParamsSchema,
  roomPushSchema,
  roomUpdateSchema,
  siteParamsSchema,
  tableQuerySchema,
} from '../schemas/index.js';
import {
  createRoom,
  deleteRoom,
  getRoom,
  listAllRooms,
  listRooms,
  updateRoom,
} from '../services/room-service.js';

interface RoomParams {
  Params: { organizationId: string; siteId: string; roomId: string };
}

interface OrgRoomsQuery {
  Params: { organizationId: string };
  Querystring: { siteId?: string };
}

interface SiteRoomsQuery {
  Params: { organizationId: string; siteId: string };
  Querystring: unknown;
}

interface SiteParams {
  Params: { organizationId: string; siteId: string };
}

/** Lists rooms in an organization, optionally filtered by site via query param. */
export async function listRoomsHandler(
  request: FastifyRequest<OrgRoomsQuery>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listRooms(organizationId, query, request.query.siteId);
  return reply.status(200).send(result);
}

/** Lists rooms within a specific site (site ID from route params). */
export async function listRoomsBySiteHandler(
  request: FastifyRequest<SiteRoomsQuery>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId, siteId } = siteParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listRooms(organizationId, query, siteId);
  return reply.status(200).send(result);
}

/** Lists all rooms in an organization, optionally filtered by site via query. */
export async function listAllRoomsHandler(
  request: FastifyRequest<OrgRoomsQuery>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const rooms = await listAllRooms(organizationId, request.query.siteId);
  return reply.status(200).send(rooms);
}

/** Lists all rooms within a specific site (site ID from route params). */
export async function listAllRoomsBySiteHandler(
  request: FastifyRequest<SiteParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId, siteId } = siteParamsSchema.parse(request.params);
  const rooms = await listAllRooms(organizationId, siteId);
  return reply.status(200).send(rooms);
}

export async function getRoomHandler(
  request: FastifyRequest<RoomParams>,
  reply: FastifyReply,
): Promise<void> {
  const { roomId } = roomParamsSchema.parse(request.params);
  const room = await getRoom(roomId);
  return reply.status(200).send(room);
}

export async function createRoomHandler(
  request: FastifyRequest<{ Params: { organizationId: string; siteId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId, siteId } = siteParamsSchema.parse(request.params);
  const rawBody = request.body as Record<string, unknown>;
  const body = roomPushSchema.parse({ ...rawBody, siteId, organizationId });
  const room = await createRoom(body);
  return reply.status(200).send(room);
}

export async function updateRoomHandler(
  request: FastifyRequest<RoomParams>,
  reply: FastifyReply,
): Promise<void> {
  const { roomId } = roomParamsSchema.parse(request.params);
  const data = roomUpdateSchema.parse(request.body);
  const room = await updateRoom(roomId, data);
  return reply.status(200).send(room);
}

export async function deleteRoomHandler(
  request: FastifyRequest<RoomParams>,
  reply: FastifyReply,
): Promise<void> {
  const { roomId } = roomParamsSchema.parse(request.params);
  await deleteRoom(roomId);
  return reply.status(200).send({ success: true });
}
