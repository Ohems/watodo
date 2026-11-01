import type { FastifyInstance } from 'fastify';
import {
  createRoomHandler,
  deleteRoomHandler,
  getRoomHandler,
  listAllRoomsBySiteHandler,
  listAllRoomsHandler,
  listRoomsBySiteHandler,
  listRoomsHandler,
  updateRoomHandler,
} from '../controllers/room-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgRoomsQuery {
  Params: { organizationId: string };
  Querystring: { siteId?: string };
}

interface SiteParams {
  Params: { organizationId: string; siteId: string };
}

interface RoomParams {
  Params: { organizationId: string; siteId: string; roomId: string };
}

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.ROOM_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.ROOM_MANAGEMENT_WRITE);

  // Rooms scoped under a site.
  app.get<SiteParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId/rooms',
    { preHandler: read },
    listRoomsBySiteHandler,
  );

  app.get<SiteParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId/rooms/all',
    { preHandler: read },
    listAllRoomsBySiteHandler,
  );

  app.post<SiteParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId/rooms',
    { preHandler: write },
    createRoomHandler,
  );

  app.get<RoomParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId/rooms/:roomId',
    { preHandler: read },
    getRoomHandler,
  );

  app.patch<RoomParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId/rooms/:roomId',
    { preHandler: write },
    updateRoomHandler,
  );

  app.delete<RoomParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId/rooms/:roomId',
    { preHandler: write },
    deleteRoomHandler,
  );

  // Also allow listing all rooms in an organization (for dropdowns), optionally
  // filtered by site via query param.
  app.get<OrgRoomsQuery>(
    '/api/v1/organizations/:organizationId/rooms',
    { preHandler: read },
    listRoomsHandler,
  );

  app.get<OrgRoomsQuery>(
    '/api/v1/organizations/:organizationId/rooms/all',
    { preHandler: read },
    listAllRoomsHandler,
  );
}
