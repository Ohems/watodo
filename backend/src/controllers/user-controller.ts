import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import {
  providerSchema,
  userPushSchema,
  userQuerySchema,
  userSelfUpdateSchema,
} from '../schemas/index.js';
import { deleteAccount, getAuthAccounts, unlinkAuthAccount } from '../services/auth-service.js';
import {
  deleteUser,
  getUser,
  getUserList,
  getUsers,
  serializeUser,
  updateUser,
  updateUserProfile,
} from '../services/user-service.js';

export async function getUsersHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const options = userQuerySchema.parse(request.query);
  const users = await getUsers(options);
  return reply.status(200).send(users);
}

export async function getUserHandler(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { userId } = request.params;
  const user = await getUser(userId);
  return reply.status(200).send(user);
}

export async function getCurrentUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  return reply.status(200).send(serializeUser(auth.user, auth.permissions));
}

export async function getUserListHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userList = await getUserList();
  return reply.status(200).send(userList);
}

export async function updateUserHandler(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { userId } = request.params;
  const data = userPushSchema.parse(request.body);
  const updatedUser = await updateUser(userId, data);
  return reply.status(200).send(updatedUser);
}

export async function deleteUserHandler(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { userId } = request.params;
  await deleteUser(userId);
  return reply.status(200).send({ success: true });
}

/**
 * Lets the authenticated user update their own personal information. Unlike
 * updateUserHandler this requires no user-management permission.
 */
export async function updateCurrentUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const data = userSelfUpdateSchema.parse(request.body);
  const updatedUser = await updateUserProfile(auth.user.id, data);
  return reply.status(200).send(updatedUser);
}

/** Permanently deletes the authenticated user's own account. */
export async function deleteCurrentUserHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  await deleteAccount(auth.user.id);
  return reply.status(200).send({ success: true });
}

/** Lists the login methods connected to the authenticated user's account. */
export async function getAuthAccountsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const accounts = await getAuthAccounts(auth.user.id);
  return reply.status(200).send(accounts);
}

/** Disconnects a login method from the authenticated user's account. */
export async function unlinkAuthAccountHandler(
  request: FastifyRequest<{ Params: { provider: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const provider = providerSchema.parse(request.params.provider);
  await unlinkAuthAccount(auth.user.id, provider);
  return reply.status(200).send({ success: true });
}
