import type { FastifyInstance } from 'fastify';
import { getLocaleBundleHandler } from '../controllers/locale-controller.js';

export async function localeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/v1/locales/:lng', getLocaleBundleHandler);
}
