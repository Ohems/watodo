import type { FastifyInstance } from 'fastify';
import { callback, login, logoutHandler } from '../controllers/auth-controller.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/auth/:provider/login', login);
  app.get('/api/v1/auth/:provider/callback', callback);
  app.get('/api/v1/auth/logout', logoutHandler);
}
