import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  organizationParamsSchema,
  roleAssignmentParamsSchema,
  roleAssignmentSchema,
  roleParamsSchema,
  rolePushSchema,
  roleUpdateSchema,
} from '../schemas/index.js';
import {
  assignRole,
  createRole,
  deleteRole,
  listAssignments,
  listRoles,
  unassignRole,
  updateRole,
} from '../services/role-service.js';

type OrganizationRequest = FastifyRequest<{ Params: { organizationId: string } }>;
type RoleRequest = FastifyRequest<{ Params: { organizationId: string; roleId: string } }>;
type AssignmentRequest = FastifyRequest<{
  Params: { organizationId: string; roleId: string; assignmentId: string };
}>;

export async function listRolesHandler(request: OrganizationRequest, reply: FastifyReply) {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const roles = await listRoles(organizationId);
  return reply.status(200).send(roles);
}

export async function createRoleHandler(request: OrganizationRequest, reply: FastifyReply) {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const data = rolePushSchema.parse(request.body);
  const role = await createRole(organizationId, data);
  return reply.status(201).send(role);
}

export async function updateRoleHandler(request: RoleRequest, reply: FastifyReply) {
  const { organizationId, roleId } = roleParamsSchema.parse(request.params);
  const data = roleUpdateSchema.parse(request.body);
  const role = await updateRole(organizationId, roleId, data);
  return reply.status(200).send(role);
}

export async function deleteRoleHandler(request: RoleRequest, reply: FastifyReply) {
  const { organizationId, roleId } = roleParamsSchema.parse(request.params);
  await deleteRole(organizationId, roleId);
  return reply.status(200).send({ success: true });
}

export async function listAssignmentsHandler(request: RoleRequest, reply: FastifyReply) {
  const { organizationId, roleId } = roleParamsSchema.parse(request.params);
  const assignments = await listAssignments(organizationId, roleId);
  return reply.status(200).send(assignments);
}

export async function assignRoleHandler(request: RoleRequest, reply: FastifyReply) {
  const { organizationId, roleId } = roleParamsSchema.parse(request.params);
  const data = roleAssignmentSchema.parse(request.body);
  const assignment = await assignRole(organizationId, roleId, data);
  return reply.status(201).send(assignment);
}

export async function unassignRoleHandler(request: AssignmentRequest, reply: FastifyReply) {
  const { organizationId, roleId, assignmentId } = roleAssignmentParamsSchema.parse(request.params);
  await unassignRole(organizationId, roleId, assignmentId);
  return reply.status(200).send({ success: true });
}
