import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import {
  organizationParamsSchema,
  userCertificationPushSchema,
  userCertificationUpdateSchema,
  userWorkRolePushSchema,
  userWorkRoleUpdateSchema,
} from '../schemas/index.js';
import {
  addUserCertification,
  addUserWorkRole,
  getMyCertifications,
  getMyWorkRoles,
  listUserCertifications,
  listUserWorkRoles,
  listWorkRoleUsers,
  removeUserCertification,
  removeUserWorkRole,
  updateUserCertification,
  updateUserWorkRole,
} from '../services/user-work-role-service.js';

interface OrgParams {
  Params: { organizationId: string };
}

interface UserParams {
  Params: { organizationId: string; userId: string };
}

interface UserWorkRoleIdParams {
  Params: { organizationId: string; userWorkRoleId: string };
}

interface UserCertificationIdParams {
  Params: { organizationId: string; userCertificationId: string };
}

function parseId(value: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid ID: ${value}`);
  }
  return id;
}

/** Gets the authenticated user's ID or sends a 401. */
function requireAuth(request: FastifyRequest, reply: FastifyReply): { userId: string } | null {
  const auth = getAuth(request);
  if (!auth) {
    reply.status(401).send({ error: 'Not authenticated!' });
    return null;
  }
  return { userId: auth.user.id };
}

// --- Self-service: current user's work roles ---

export async function getMyWorkRolesHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = requireAuth(request, reply);
  if (!auth) return;
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const roles = await getMyWorkRoles(organizationId, auth.userId);
  return reply.status(200).send(roles);
}

export async function addMyWorkRoleHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = requireAuth(request, reply);
  if (!auth) return;
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const data = userWorkRolePushSchema.parse(request.body);
  const role = await addUserWorkRole(organizationId, auth.userId, data);
  return reply.status(200).send(role);
}

export async function removeMyWorkRoleHandler(
  request: FastifyRequest<UserWorkRoleIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userWorkRoleId = parseId(request.params.userWorkRoleId);
  await removeUserWorkRole(userWorkRoleId);
  return reply.status(200).send({ success: true });
}

// --- Self-service: current user's certifications ---

export async function getMyCertificationsHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = requireAuth(request, reply);
  if (!auth) return;
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const certs = await getMyCertifications(organizationId, auth.userId);
  return reply.status(200).send(certs);
}

export async function addMyCertificationHandler(
  request: FastifyRequest<OrgParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = requireAuth(request, reply);
  if (!auth) return;
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const data = userCertificationPushSchema.parse(request.body);
  const cert = await addUserCertification(organizationId, auth.userId, data);
  return reply.status(200).send(cert);
}

export async function removeMyCertificationHandler(
  request: FastifyRequest<UserCertificationIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userCertificationId = parseId(request.params.userCertificationId);
  await removeUserCertification(userCertificationId);
  return reply.status(200).send({ success: true });
}

export async function updateMyCertificationHandler(
  request: FastifyRequest<UserCertificationIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userCertificationId = parseId(request.params.userCertificationId);
  const data = userCertificationUpdateSchema.parse(request.body);
  const cert = await updateUserCertification(userCertificationId, data);
  return reply.status(200).send(cert);
}

// --- Admin: manage any user's work roles ---

export async function listUserWorkRolesHandler(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const { userId } = request.params;
  const roles = await listUserWorkRoles(organizationId, userId);
  return reply.status(200).send(roles);
}

export async function addUserWorkRoleHandler(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const { userId } = request.params;
  const data = userWorkRolePushSchema.parse(request.body);
  const role = await addUserWorkRole(organizationId, userId, data);
  return reply.status(200).send(role);
}

export async function updateUserWorkRoleHandler(
  request: FastifyRequest<UserWorkRoleIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userWorkRoleId = parseId(request.params.userWorkRoleId);
  const data = userWorkRoleUpdateSchema.parse(request.body);
  const role = await updateUserWorkRole(userWorkRoleId, data);
  return reply.status(200).send(role);
}

export async function removeUserWorkRoleHandler(
  request: FastifyRequest<UserWorkRoleIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userWorkRoleId = parseId(request.params.userWorkRoleId);
  await removeUserWorkRole(userWorkRoleId);
  return reply.status(200).send({ success: true });
}

// --- Admin: manage any user's certifications ---

export async function listUserCertificationsHandler(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const { userId } = request.params;
  const certs = await listUserCertifications(organizationId, userId);
  return reply.status(200).send(certs);
}

export async function addUserCertificationHandler(
  request: FastifyRequest<UserParams>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const { userId } = request.params;
  const data = userCertificationPushSchema.parse(request.body);
  const cert = await addUserCertification(organizationId, userId, data);
  return reply.status(200).send(cert);
}

export async function removeUserCertificationHandler(
  request: FastifyRequest<UserCertificationIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userCertificationId = parseId(request.params.userCertificationId);
  await removeUserCertification(userCertificationId);
  return reply.status(200).send({ success: true });
}

export async function updateUserCertificationHandler(
  request: FastifyRequest<UserCertificationIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const userCertificationId = parseId(request.params.userCertificationId);
  const data = userCertificationUpdateSchema.parse(request.body);
  const cert = await updateUserCertification(userCertificationId, data);
  return reply.status(200).send(cert);
}

// --- Admin: list users for a work role ---

export async function listWorkRoleUsersHandler(
  request: FastifyRequest<{ Params: { organizationId: string; workRoleId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId } = organizationParamsSchema.parse(request.params);
  const workRoleId = parseId(request.params.workRoleId);
  const users = await listWorkRoleUsers(organizationId, workRoleId);
  return reply.status(200).send(users);
}
