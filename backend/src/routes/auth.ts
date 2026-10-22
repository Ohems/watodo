import type { FastifyInstance } from 'fastify';
import {
  callback,
  linkHandler,
  login,
  logoutHandler,
  providersHandler,
} from '../controllers/auth-controller.js';
import { requirePermissions } from '../middleware/auth.js';

interface ProviderParams {
  Params: { provider: string };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/auth/providers', providersHandler);
  app.get('/api/v1/auth/:provider/login', login);
  app.get('/api/v1/auth/:provider/callback', callback);
  app.post<ProviderParams>(
    '/api/v1/auth/:provider/link',
    { preHandler: requirePermissions() },
    linkHandler,
  );
  app.get('/api/v1/auth/logout', logoutHandler);
}
