import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import { userPushSchema, userQuerySchema } from '../schemas/index.js';
import {
  deleteUser,
  getUser,
  getUserList,
  getUsers,
  updateUser,
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
  return reply.status(200).send({ ...auth.user, permissions: auth.permissions });
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
