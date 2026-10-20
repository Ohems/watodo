import type { FastifyReply, FastifyRequest } from 'fastify';
import { opAssignmentSchema, operationSchema } from '../schemas/index.js';
import {
  deleteOpAssignment,
  deleteOperation,
  getOperation,
  getOperations,
  upsertOpAssignment,
  upsertOperation,
} from '../services/operation-service.js';

type OperationRequest = FastifyRequest<{ Params: { operationId: string } }>;
type AssignmentRequest = FastifyRequest<{ Params: { operationId: string; assignmentId: string } }>;

export async function getOperationsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const operations = await getOperations();
  return reply.status(200).send(operations);
}

export async function getOperationHandler(
  request: OperationRequest,
  reply: FastifyReply,
): Promise<void> {
  const operationId = Number.parseInt(request.params.operationId, 10);
  const operation = await getOperation(operationId);
  return reply.status(200).send(operation);
}

export async function upsertOperationHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = operationSchema.parse(request.body);
  const operation = await upsertOperation(data);
  return reply.status(200).send(operation);
}

export async function deleteOperationHandler(
  request: OperationRequest,
  reply: FastifyReply,
): Promise<void> {
  const operationId = Number.parseInt(request.params.operationId, 10);
  await deleteOperation(operationId);
  return reply.status(200).send({ success: true });
}

export async function upsertOpAssignmentHandler(
  request: OperationRequest,
  reply: FastifyReply,
): Promise<void> {
  const operationId = Number.parseInt(request.params.operationId, 10);
  const data = opAssignmentSchema.parse(request.body);
  const assignment = await upsertOpAssignment(operationId, undefined, data);
  return reply.status(200).send(assignment);
}

export async function updateOpAssignmentHandler(
  request: AssignmentRequest,
  reply: FastifyReply,
): Promise<void> {
  const operationId = Number.parseInt(request.params.operationId, 10);
  const assignmentId = Number.parseInt(request.params.assignmentId, 10);
  const data = opAssignmentSchema.parse(request.body);
  const assignment = await upsertOpAssignment(operationId, assignmentId, data);
  return reply.status(200).send(assignment);
}

export async function deleteOpAssignmentHandler(
  request: AssignmentRequest,
  reply: FastifyReply,
): Promise<void> {
  const operationId = Number.parseInt(request.params.operationId, 10);
  const assignmentId = Number.parseInt(request.params.assignmentId, 10);
  await deleteOpAssignment(operationId, assignmentId);
  return reply.status(200).send({ success: true });
}
