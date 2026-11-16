import type { FastifyInstance } from 'fastify';
import {
  createMyAbsenceHandler,
  deleteMyAbsenceHandler,
  listMyAbsencesHandler,
  updateMyAbsenceHandler,
} from '../controllers/absence-controller.js';
import { requirePermissions } from '../middleware/auth.js';

// Self-service absence endpoints: any authenticated user manages their own
// absences, no extra permission required.
export async function absenceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/api/v1/users/@me/absences',
    { preHandler: requirePermissions() },
    listMyAbsencesHandler,
  );
  app.post(
    '/api/v1/users/@me/absences',
    { preHandler: requirePermissions() },
    createMyAbsenceHandler,
  );
  app.patch<{ Params: { absenceId: string } }>(
    '/api/v1/users/@me/absences/:absenceId',
    { preHandler: requirePermissions() },
    updateMyAbsenceHandler,
  );
  app.delete<{ Params: { absenceId: string } }>(
    '/api/v1/users/@me/absences/:absenceId',
    { preHandler: requirePermissions() },
    deleteMyAbsenceHandler,
  );
}
