import type { FastifyInstance } from 'fastify';
import {
  deleteUserHandler,
  getCurrentUserHandler,
  getUserHandler,
  getUserListHandler,
  getUsersHandler,
  updateUserHandler,
} from '../controllers/user-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface UserParams {
  Params: { userId: string };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/users/@me', { preHandler: requirePermissions() }, getCurrentUserHandler);

  app.get('/api/v1/users/list', getUserListHandler);

  app.get<UserParams>(
    '/api/v1/users/:userId',
    { preHandler: requirePermissions(PERMISSIONS.USER_MANAGEMENT_READ) },
    getUserHandler,
  );

  app.get(
    '/api/v1/users',
    { preHandler: requirePermissions(PERMISSIONS.USER_MANAGEMENT_READ) },
    getUsersHandler,
  );

  app.patch<UserParams>(
    '/api/v1/users/:userId',
    { preHandler: requirePermissions(PERMISSIONS.USER_MANAGEMENT_WRITE) },
    updateUserHandler,
  );

  app.delete<UserParams>(
    '/api/v1/users/:userId',
    { preHandler: requirePermissions(PERMISSIONS.USER_MANAGEMENT_WRITE) },
    deleteUserHandler,
  );
}
