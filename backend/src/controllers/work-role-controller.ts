import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  certificationWorkRoleParamsSchema,
  certificationWorkRolePushSchema,
  organizationParamsSchema,
  tableQuerySchema,
  workRolePushSchema,
  workRoleUpdateSchema,
} from '../schemas/index.js';
import {
  addCertificationToWorkRole,
  createWorkRole,
  deleteWorkRole,
  getWorkRole,
  listAllWorkRoles,
  listWorkRoleCertifications,
  listWorkRoles,
  removeCertificationFromWorkRole,
  updateWorkRole,
} from '../services/work-role-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface WorkRoleParams {
  Params: { organizationId: string; workRoleId: string };
}

interface WorkRoleCertParams {
  Params: { organizationId: string; workRoleId: string; certificationId: string };
}

function parseWorkRoleId(value: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid work role ID: ${value}`);
  }
  return id;
}

function parseCertificationId(value: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid certification ID: ${value}`);
  }
  return id;
}

export async function listWorkRolesHandler(
  request: FastifyRequest<{ Params: { organizationId: string }; Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const query = tableQuerySchema.parse(request.query);
  const result = await listWorkRoles(organizationId, query);
  return reply.status(200).send(result);
}

export async function listAllWorkRolesHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const roles = await listAllWorkRoles(organizationId);
  return reply.status(200).send(roles);
}

export async function getWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const workRoleId = parseWorkRoleId(request.params.workRoleId);
  const role = await getWorkRole(workRoleId);
  return reply.status(200).send(role);
}

export async function createWorkRoleHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = workRolePushSchema.parse(request.body);
  const role = await createWorkRole(data);
  return reply.status(200).send(role);
}

export async function updateWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const workRoleId = parseWorkRoleId(request.params.workRoleId);
  const data = workRoleUpdateSchema.parse(request.body);
  const role = await updateWorkRole(workRoleId, data);
  return reply.status(200).send(role);
}

export async function deleteWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const workRoleId = parseWorkRoleId(request.params.workRoleId);
  await deleteWorkRole(workRoleId);
  return reply.status(200).send({ success: true });
}

export async function listWorkRoleCertificationsHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const workRoleId = parseWorkRoleId(request.params.workRoleId);
  const certs = await listWorkRoleCertifications(workRoleId);
  return reply.status(200).send(certs);
}

export async function addCertificationToWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const workRoleId = parseWorkRoleId(request.params.workRoleId);
  const data = certificationWorkRolePushSchema.parse(request.body);
  await addCertificationToWorkRole(workRoleId, data.certificationId);
  return reply.status(200).send({ success: true });
}

export async function removeCertificationFromWorkRoleHandler(
  request: FastifyRequest<WorkRoleCertParams>,
  reply: FastifyReply,
): Promise<void> {
  const params = certificationWorkRoleParamsSchema.parse(request.params);
  const workRoleId = parseWorkRoleId(params.workRoleId.toString());
  const certificationId = parseCertificationId(params.certificationId.toString());
  await removeCertificationFromWorkRole(workRoleId, certificationId);
  return reply.status(200).send({ success: true });
}
