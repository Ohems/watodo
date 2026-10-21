import type { FastifyReply, FastifyRequest } from 'fastify';
import { calendarPushSchema } from '../schemas/index.js';
import { createCalendar, listCalendars } from '../services/calendar-service.js';

export async function listCalendarsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const calendars = await listCalendars();
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
