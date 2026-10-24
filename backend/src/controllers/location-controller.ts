import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  locationPushSchema,
  locationUpdateSchema,
  organizationParamsSchema,
  tableQuerySchema,
} from '../schemas/index.js';
import {
  createLocation,
  deleteLocation,
  getLocation,
  listAllLocations,
  listLocations,
  updateLocation,
} from '../services/location-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface LocationParams {
  Params: { organizationId: string; locationId: string };
}

export async function listLocationsHandler(
  request: FastifyRequest<{ Params: { organizationId: string }; Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listLocations(organizationId, query);
  return reply.status(200).send(result);
}

export async function listAllLocationsHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const locations = await listAllLocations(organizationId);
  return reply.status(200).send(locations);
}

export async function getLocationHandler(
  request: FastifyRequest<LocationParams>,
  reply: FastifyReply,
): Promise<void> {
  const { locationId } = request.params;
  const location = await getLocation(locationId);
  return reply.status(200).send(location);
}

export async function createLocationHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = locationPushSchema.parse(request.body);
  const location = await createLocation(data);
  return reply.status(200).send(location);
}

export async function updateLocationHandler(
  request: FastifyRequest<LocationParams>,
  reply: FastifyReply,
): Promise<void> {
  const { locationId } = request.params;
  const data = locationUpdateSchema.parse(request.body);
  const location = await updateLocation(locationId, data);
  return reply.status(200).send(location);
}

export async function deleteLocationHandler(
  request: FastifyRequest<LocationParams>,
  reply: FastifyReply,
): Promise<void> {
  const { locationId } = request.params;
  await deleteLocation(locationId);
  return reply.status(200).send({ success: true });
}
