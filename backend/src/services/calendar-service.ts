import { db } from '../database.js';
import type { Calendar } from '../db/types.js';
import { badRequest, isUniqueViolation, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { CalendarPush } from '../schemas/index.js';

const logger = createLogger('calendar-service');

export interface CalendarResponse {
  id: string;
  name: string;
  googleCalendarId: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

function serializeCalendar(calendar: Calendar): CalendarResponse {
  return {
    id: calendar.id,
    name: calendar.name,
    googleCalendarId: calendar.google_calendar_id,
    organizationId: calendar.organization_id,
    createdAt: calendar.created_at.toISOString(),
    updatedAt: calendar.updated_at.toISOString(),
  };
}

export async function listCalendars(): Promise<CalendarResponse[]> {
  logger.trace('calendarService.listCalendars');
  const rows = await db.selectFrom('calendars').selectAll().orderBy('name', 'asc').execute();
  return rows.map(serializeCalendar);
}

export async function createCalendar(data: CalendarPush): Promise<CalendarResponse> {
  logger.trace('calendarService.createCalendar');
  const organization = await db
    .selectFrom('organizations')
    .select('id')
    .where('id', '=', data.organizationId)
    .executeTakeFirst();
  if (!organization) {
    throw notFound(`Organization ${data.organizationId} not found!`);
  }

  try {
    const calendar = await db
      .insertInto('calendars')
      .values({
        name: data.name,
        organization_id: data.organizationId,
        google_calendar_id: data.googleCalendarId ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return serializeCalendar(calendar);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest('A calendar with this Google Calendar ID already exists!');
    }
    throw error;
  }
}
