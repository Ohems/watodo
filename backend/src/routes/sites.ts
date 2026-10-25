import type { FastifyInstance } from 'fastify';
import {
  createSiteHandler,
  deleteSiteHandler,
  getSiteHandler,
  listAllSitesHandler,
  listSitesHandler,
  updateSiteHandler,
} from '../controllers/site-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface SiteParams {
  Params: { organizationId: string; siteId: string };
}

export async function siteRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.SITE_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.SITE_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/sites',
    { preHandler: read },
    listSitesHandler,
  );

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/sites/all',
    { preHandler: read },
    listAllSitesHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/sites',
    { preHandler: write },
    createSiteHandler,
  );

  app.get<SiteParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId',
    { preHandler: read },
    getSiteHandler,
  );

  app.patch<SiteParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId',
    { preHandler: write },
    updateSiteHandler,
  );

  app.delete<SiteParams>(
    '/api/v1/organizations/:organizationId/sites/:siteId',
    { preHandler: write },
    deleteSiteHandler,
  );
}
