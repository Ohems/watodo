import type { FastifyInstance } from 'fastify';
import {
  deleteCurrentUserHandler,
  deleteUserHandler,
  getAuthAccountsHandler,
  getCurrentUserHandler,
  getUserHandler,
  getUserListHandler,
  getUsersHandler,
  unlinkAuthAccountHandler,
  updateCurrentUserHandler,
  updateUserHandler,
} from '../controllers/user-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

interface UserParams {
  Params: { userId: string };
}

interface AuthAccountParams {
  Params: { provider: string };
}

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/users/@me', { preHandler: requirePermissions() }, getCurrentUserHandler);

  // Self-service account endpoints: any authenticated user manages their own
  // account, no user-management permission required.
  app.patch('/api/v1/users/@me', { preHandler: requirePermissions() }, updateCurrentUserHandler);

  app.delete('/api/v1/users/@me', { preHandler: requirePermissions() }, deleteCurrentUserHandler);

  app.get(
    '/api/v1/users/@me/auth-accounts',
    { preHandler: requirePermissions() },
    getAuthAccountsHandler,
  );

  app.delete<AuthAccountParams>(
    '/api/v1/users/@me/auth-accounts/:provider',
    { preHandler: requirePermissions() },
    unlinkAuthAccountHandler,
  );

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
