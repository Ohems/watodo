import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth.js';
import { calendarRoutes } from './calendars.js';
import { eventRoutes } from './events.js';
import { jobRoutes } from './jobs.js';
import { notificationRoutes } from './notifications.js';
import { operationRoutes } from './operations.js';
import { organizationRoutes } from './organizations.js';
import { roleRoutes } from './roles.js';
import { roomRoutes } from './rooms.js';
import { siteRoutes } from './sites.js';
import { teamRoutes } from './teams.js';
import { userRoutes } from './users.js';

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));
  await authRoutes(app);
  await userRoutes(app);
  await operationRoutes(app);
  await roleRoutes(app);
  await organizationRoutes(app);
  await calendarRoutes(app);
  await eventRoutes(app);
  await teamRoutes(app);
  await siteRoutes(app);
  await roomRoutes(app);
  await jobRoutes(app);
  await notificationRoutes(app);
}
