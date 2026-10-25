import type { FastifyInstance } from 'fastify';
import {
  createLocationHandler,
  deleteLocationHandler,
  getLocationHandler,
  listAllLocationsHandler,
  listLocationsHandler,
  updateLocationHandler,
} from '../controllers/location-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface LocationParams {
  Params: { organizationId: string; locationId: string };
}

export async function locationRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.LOCATION_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.LOCATION_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/locations',
    { preHandler: read },
    listLocationsHandler,
  );

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/locations/all',
    { preHandler: read },
    listAllLocationsHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/locations',
    { preHandler: write },
    createLocationHandler,
  );

  app.get<LocationParams>(
    '/api/v1/organizations/:organizationId/locations/:locationId',
    { preHandler: read },
    getLocationHandler,
  );

  app.patch<LocationParams>(
    '/api/v1/organizations/:organizationId/locations/:locationId',
    { preHandler: write },
    updateLocationHandler,
  );

  app.delete<LocationParams>(
    '/api/v1/organizations/:organizationId/locations/:locationId',
    { preHandler: write },
    deleteLocationHandler,
  );
}
