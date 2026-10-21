import type { FastifyInstance } from 'fastify';
import { createCalendarHandler, listCalendarsHandler } from '../controllers/calendar-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

export async function calendarRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.EVENTS_READ);
  const write = requirePermissions(PERMISSIONS.EVENTS_WRITE);

  app.get('/api/v1/calendars', { preHandler: read }, listCalendarsHandler);
  app.post('/api/v1/calendars', { preHandler: write }, createCalendarHandler);
}
