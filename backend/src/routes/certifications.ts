import type { FastifyInstance } from 'fastify';
import {
  createCertificationHandler,
  deleteCertificationHandler,
  getCertificationHandler,
  listAllCertificationsHandler,
  listCertificationsHandler,
  updateCertificationHandler,
} from '../controllers/certification-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface CertificationParams {
  Params: { organizationId: string; certificationId: string };
}

export async function certificationRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.CERTIFICATION_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.CERTIFICATION_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/certifications',
    { preHandler: read },
    listCertificationsHandler,
  );

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/certifications/all',
    { preHandler: read },
    listAllCertificationsHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/certifications',
    { preHandler: write },
    createCertificationHandler,
  );

  app.get<CertificationParams>(
    '/api/v1/organizations/:organizationId/certifications/:certificationId',
    { preHandler: read },
    getCertificationHandler,
  );

  app.patch<CertificationParams>(
    '/api/v1/organizations/:organizationId/certifications/:certificationId',
    { preHandler: write },
    updateCertificationHandler,
  );

  app.delete<CertificationParams>(
    '/api/v1/organizations/:organizationId/certifications/:certificationId',
    { preHandler: write },
    deleteCertificationHandler,
  );
}
