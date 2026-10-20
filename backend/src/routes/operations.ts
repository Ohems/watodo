import type { FastifyInstance } from 'fastify';
import {
  deleteOpAssignmentHandler,
  deleteOperationHandler,
  getOperationHandler,
  getOperationsHandler,
  updateOpAssignmentHandler,
  upsertOpAssignmentHandler,
  upsertOperationHandler,
} from '../controllers/operation-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface OperationParams {
  Params: { operationId: string };
}

interface AssignmentParams {
  Params: { operationId: string; assignmentId: string };
}

export async function operationRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.OPERATIONS_READ);
  const write = requirePermissions(PERMISSIONS.OPERATIONS_WRITE);

  app.get('/api/v1/operations', { preHandler: read }, getOperationsHandler);

  app.get<OperationParams>(
    '/api/v1/operations/:operationId',
    { preHandler: read },
    getOperationHandler,
  );

  app.post('/api/v1/operations', { preHandler: write }, upsertOperationHandler);

  app.delete<OperationParams>(
    '/api/v1/operations/:operationId',
    { preHandler: write },
    deleteOperationHandler,
  );

  app.post<OperationParams>(
    '/api/v1/operations/:operationId/assignments',
    { preHandler: write },
    upsertOpAssignmentHandler,
  );

  app.patch<AssignmentParams>(
    '/api/v1/operations/:operationId/assignments/:assignmentId',
    { preHandler: write },
    updateOpAssignmentHandler,
  );

  app.delete<AssignmentParams>(
    '/api/v1/operations/:operationId/assignments/:assignmentId',
    { preHandler: write },
    deleteOpAssignmentHandler,
  );
}
