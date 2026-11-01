import type { Selectable } from 'kysely';
import { db } from '../database.js';
import type { EventTypes } from '../db/types.js';
import { createLogger } from '../logger.js';

const logger = createLogger('event-type-service');

export interface EventTypeResponse {
  id: number;
  name: string;
  description: string;
  recurrence: string | null;
  calendarId: string;
  createdAt: string;
  updatedAt: string;
}

function serializeEventType(eventType: Selectable<EventTypes>): EventTypeResponse {
  return {
    id: eventType.id,
    name: eventType.name,
    description: eventType.description,
    recurrence: eventType.recurrence,
    calendarId: eventType.calendar_id,
    createdAt: eventType.created_at.toISOString(),
    updatedAt: eventType.updated_at.toISOString(),
  };
}

/**
 * Lists all event types in an organization (via their calendars), no pagination.
 * @param organizationId - The organization ID.
 * @returns The event types.
 */
export async function listEventTypes(organizationId: string): Promise<EventTypeResponse[]> {
  logger.trace('eventTypeService.listEventTypes');
  const rows = await db
    .selectFrom('event_types')
    .innerJoin('calendars', 'calendars.id', 'event_types.calendar_id')
    .selectAll('event_types')
    .where('calendars.organization_id', '=', organizationId)
    .orderBy('event_types.name', 'asc')
    .execute();
  return rows.map(serializeEventType);
}
