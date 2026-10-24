import type { FastifyInstance } from 'fastify';
import {
  createJobHandler,
  deleteJobHandler,
  getJobHandler,
  listAllJobsHandler,
  listJobsHandler,
  updateJobHandler,
} from '../controllers/job-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface JobParams {
  Params: { organizationId: string; jobId: string };
}

export async function jobRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.JOB_MANAGEMENT_READ);
  const write = requirePermissions(PERMISSIONS.JOB_MANAGEMENT_WRITE);

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/jobs',
    { preHandler: read },
    listJobsHandler,
  );

  app.get<OrgParams>(
    '/api/v1/organizations/:organizationId/jobs/all',
    { preHandler: read },
    listAllJobsHandler,
  );

  app.post<OrgParams>(
    '/api/v1/organizations/:organizationId/jobs',
    { preHandler: write },
    createJobHandler,
  );

  app.get<JobParams>(
    '/api/v1/organizations/:organizationId/jobs/:jobId',
    { preHandler: read },
    getJobHandler,
  );

  app.patch<JobParams>(
    '/api/v1/organizations/:organizationId/jobs/:jobId',
    { preHandler: write },
    updateJobHandler,
  );

  app.delete<JobParams>(
    '/api/v1/organizations/:organizationId/jobs/:jobId',
    { preHandler: write },
    deleteJobHandler,
  );
}
