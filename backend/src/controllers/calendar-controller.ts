import type { FastifyReply, FastifyRequest } from 'fastify';
import { calendarListQuerySchema, calendarPushSchema } from '../schemas/index.js';
import { createCalendar, listCalendars } from '../services/calendar-service.js';

export async function listCalendarsHandler(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const query = calendarListQuerySchema.parse(request.query);
  const calendars = await listCalendars(query.organizationId);
  return reply.status(200).send(calendars);
}

export async function createCalendarHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = calendarPushSchema.parse(request.body);
  const calendar = await createCalendar(data);
  return reply.status(200).send(calendar);
}
