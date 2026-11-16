import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import {
  absenceParamsSchema,
  absencePushSchema,
  absenceQuerySchema,
  absenceUpdateSchema,
} from '../schemas/index.js';
import {
  createAbsence,
  deleteAbsence,
  listAbsences,
  updateAbsence,
} from '../services/absence-service.js';

function requireAuthUser(request: FastifyRequest): { id: string } {
  const auth = getAuth(request);
  if (!auth) {
    throw new Error('Not authenticated!');
  }
  return auth.user;
}

export async function listMyAbsencesHandler(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const user = requireAuthUser(request);
  const query = absenceQuerySchema.parse(request.query ?? {});
  const absences = await listAbsences(user.id, query);
  return reply.status(200).send(absences);
}

export async function createMyAbsenceHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = requireAuthUser(request);
  const data = absencePushSchema.parse(request.body);
  const absence = await createAbsence(user.id, data);
  return reply.status(200).send(absence);
}

interface AbsenceParams {
  Params: { absenceId: string };
}

export async function updateMyAbsenceHandler(
  request: FastifyRequest<AbsenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const user = requireAuthUser(request);
  const { absenceId } = absenceParamsSchema.parse(request.params);
  const data = absenceUpdateSchema.parse(request.body);
  const absence = await updateAbsence(absenceId, user.id, data);
  return reply.status(200).send(absence);
}

export async function deleteMyAbsenceHandler(
  request: FastifyRequest<AbsenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const user = requireAuthUser(request);
  const { absenceId } = absenceParamsSchema.parse(request.params);
  await deleteAbsence(absenceId, user.id);
  return reply.status(200).send({ success: true });
}
