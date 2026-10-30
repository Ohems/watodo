import { db } from '../database.js';
import type { EventComment, EventOccurrenceRow, EventSeries, EventWorkRole } from '../db/types.js';
import { badRequest, forbidden, isUniqueViolation, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type {
  EventCommentPush,
  EventCommentUpdate,
  EventSeriesPush,
  EventSeriesUpdate,
  EventWorkRolePush,
  EventWorkRoleUpdate,
  OccurrenceFilter,
  RecurrenceInput,
  RescheduleOccurrenceInput,
} from '../schemas/index.js';
import {
  anchorRecurrenceAtStart,
  buildRruleString,
  type ExpandedOccurrence,
  expandOccurrences,
  isOccurrence,
  isValidTimezone,
  MAX_OCCURRENCE_RANGE_MS,
  type OccurrenceExceptionRule,
  type RecurrenceSeriesRule,
  recurrenceFromRruleString,
  toWallClockDate,
  truncateRruleString,
} from './recurrence.js';

const logger = createLogger('event-service');

const DEFAULT_DURATION_MINUTES = 60;

export interface EventSeriesResponse {
  id: number;
  title: string;
  description: string | null;
  calendarId: string;
  siteId: string | null;
  roomId: string | null;
  reserveWholeSite: boolean;
  start: string;
  durationMinutes: number;
  isAllDay: boolean;
  timezone: string;
  isVisible: boolean;
  rrule: string | null;
  recurrence: RecurrenceInput | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventOccurrenceResponse {
  /** Stable ID of the materialized occurrence instance, or null if not yet materialized. */
  occurrenceId: number | null;
  seriesId: number;
  title: string;
  description: string | null;
  isAllDay: boolean;
  siteId: string | null;
  roomId: string | null;
  reserveWholeSite: boolean;
  organizationId: string;
  organizationName: string;
  occurrenceStart: string;
  start: string;
  end: string;
  isRescheduled: boolean;
  isCancelled: boolean;
  exceptionId: number | null;
}

export interface EventExceptionResponse {
  id: number;
  seriesId: number;
  occurrenceStart: string;
  isCancelled: boolean;
  overrideStart: string | null;
  overrideEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventWorkRoleAssignmentResponse {
  id: number;
  eventWorkRoleId: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface EventWorkRoleResponse {
  id: number;
  seriesId: number;
  /** NULL = parent (series-level) slot; non-NULL = occurrence-level inherited slot. */
  occurrenceId: number | null;
  inheritedFromWorkRoleId: number | null;
  title: string;
  description: string;
  isCritical: boolean;
  workRoleId: number | null;
  workRoleName: string | null;
  assignments: EventWorkRoleAssignmentResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleReadiness {
  workRoleId: number | null;
  workRoleName: string;
  /** Total slots for this role. */
  required: number;
  /** Slots with at least one assignee. */
  filled: number;
  isCritical: boolean;
  /** True when a critical slot is unfilled. */
  isUnfilled: boolean;
}

export interface EventReadiness {
  roles: RoleReadiness[];
  /** True when all critical slots are filled. */
  isReady: boolean;
  /** Count of critical slots that are not yet filled. */
  unfilledCriticalCount: number;
}

export interface EventCommentResponse {
  id: number;
  seriesId: number;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventOccurrenceDetailResponse {
  series: EventSeriesResponse;
  occurrence: EventOccurrenceResponse;
  /** Slots visible for this occurrence: occurrence-level + parent-level. */
  workRoles: EventWorkRoleResponse[];
  /** Parent (series-level) slots only. */
  parentWorkRoles: EventWorkRoleResponse[];
  /** Occurrence-level (inherited) slots only. */
  occurrenceWorkRoles: EventWorkRoleResponse[];
  /** Parent slots not yet imported into this occurrence. */
  missingParentWorkRoles: EventWorkRoleResponse[];
  comments: EventCommentResponse[];
  readiness: EventReadiness;
}

type EventCommentRow = EventComment & { user_name: string };

function toRule(series: EventSeries): RecurrenceSeriesRule {
  return {
    start: series.start,
    durationMinutes: series.duration_minutes,
    rrule: series.rrule,
    timezone: series.timezone,
  };
}

function toExceptionRule(exception: EventOccurrenceRow): OccurrenceExceptionRule {
  return {
    id: exception.id,
    occurrenceStart: exception.occurrence_start,
    isCancelled: exception.is_cancelled,
    overrideStart: exception.override_start,
    overrideEnd: exception.override_end,
  };
}

function serializeSeries(series: EventSeries): EventSeriesResponse {
  return {
    id: series.id,
    title: series.title,
    description: series.description,
    calendarId: series.calendar_id,
    siteId: series.site_id,
    roomId: series.room_id,
    reserveWholeSite: series.reserve_whole_site,
    start: series.start.toISOString(),
    durationMinutes: series.duration_minutes,
    isAllDay: series.is_all_day,
    timezone: series.timezone,
    isVisible: series.is_visible,
    rrule: series.rrule,
    recurrence: series.rrule ? recurrenceFromRruleString(series, series.rrule) : null,
    createdAt: series.created_at.toISOString(),
    updatedAt: series.updated_at.toISOString(),
  };
}

/** The organization that owns a calendar (resolved via the calendar). */
export interface CalendarOrganization {
  organizationId: string;
  organizationName: string;
}

/**
 * Resolves the organization (id and name) of each given calendar, keyed by
 * calendar id. Every calendar belongs to exactly one organization.
 */
async function getCalendarOrganizations(
  calendarIds: string[],
): Promise<Map<string, CalendarOrganization>> {
  const result = new Map<string, CalendarOrganization>();
  const ids = [...new Set(calendarIds)];
  if (ids.length === 0) return result;
  const rows = await db
    .selectFrom('calendars')
    .innerJoin('organizations', 'organizations.id', 'calendars.organization_id')
    .select([
      'calendars.id as calendar_id',
      'organizations.id as organization_id',
      'organizations.name as organization_name',
    ])
    .where('calendars.id', 'in', ids)
    .execute();
  for (const row of rows) {
    result.set(row.calendar_id, {
      organizationId: row.organization_id,
      organizationName: row.organization_name,
    });
  }
  return result;
}

/**
 * Looks up the organization of a single calendar; throws when the calendar
 * has no organization (a data integrity violation).
 */
async function getCalendarOrganizationOrThrow(calendarId: string): Promise<CalendarOrganization> {
  const organization = (await getCalendarOrganizations([calendarId])).get(calendarId);
  if (!organization) {
    throw new Error(`Organization for calendar ${calendarId} not found!`);
  }
  return organization;
}

/**
 * Looks up the stable IDs of already-materialized occurrences. Unlike
 * `materializeOccurrences` this never inserts rows: read paths must not
 * create database rows. Returns a map from `${seriesId}:${occurrenceStartISO}`
 * to the occurrence ID (only for occurrences materialized by a write).
 */
async function lookupOccurrenceIds(
  occurrences: { seriesId: number; occurrenceStart: Date }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (occurrences.length === 0) return result;
  const seriesIds = [...new Set(occurrences.map(o => o.seriesId))];
  const rows = await db
    .selectFrom('event_occurrences')
    .select(['id', 'event_series_id', 'occurrence_start'])
    .where('event_series_id', 'in', seriesIds)
    .execute();
  for (const row of rows) {
    result.set(`${row.event_series_id}:${row.occurrence_start.toISOString()}`, row.id);
  }
  return result;
}

/**
 * Materializes a single occurrence (upsert) and returns its stable ID. Called
 * by write paths (slot creation, comments, exceptions, split) so that any
 * instance with attached data gets a permanent identifier. When the
 * occurrence is first created, the series-level (parent) role requirements
 * are copied to the occurrence so it has its own independent set of work
 * roles. Existing occurrence-level requirements are never deleted.
 */
async function ensureOccurrenceMaterialized(
  seriesId: number,
  occurrenceStart: Date,
): Promise<number> {
  const inserted = await db
    .insertInto('event_occurrences')
    .values({ event_series_id: seriesId, occurrence_start: occurrenceStart })
    .onConflict(oc => oc.columns(['event_series_id', 'occurrence_start']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (inserted) {
    // Inherit parent (series-level) work role slots into the new occurrence,
    // copying any user assignments from the parent slots as well.
    const parentSlots = await db
      .selectFrom('event_work_roles')
      .select(['id', 'title', 'description', 'is_critical', 'work_role_id'])
      .where('event_series_id', '=', seriesId)
      .where('event_occurrence_id', 'is', null)
      .execute();
    if (parentSlots.length > 0) {
      const newSlots = await db
        .insertInto('event_work_roles')
        .values(
          parentSlots.map(s => ({
            event_series_id: seriesId,
            event_occurrence_id: inserted.id,
            inherited_from_work_role_id: s.id,
            title: s.title,
            description: s.description,
            is_critical: s.is_critical,
            work_role_id: s.work_role_id,
          })),
        )
        .onConflict(oc => oc.doNothing())
        .returning(['id', 'inherited_from_work_role_id'])
        .execute();
      // Copy assignments from parent slots to the corresponding new slots.
      const parentIds = parentSlots.map(s => s.id);
      const parentAssignments = await db
        .selectFrom('event_work_role_assignments')
        .select(['event_work_role_id', 'user_id'])
        .where('event_work_role_id', 'in', parentIds)
        .execute();
      const newByParent = new Map(
        newSlots
          .filter(s => s.inherited_from_work_role_id !== null)
          .map(s => [s.inherited_from_work_role_id as number, s.id]),
      );
      const assignmentRows = parentAssignments
        .map(a => {
          const newId = newByParent.get(a.event_work_role_id);
          return newId !== undefined ? { event_work_role_id: newId, user_id: a.user_id } : null;
        })
        .filter((r): r is { event_work_role_id: number; user_id: string } => r !== null);
      if (assignmentRows.length > 0) {
        await db
          .insertInto('event_work_role_assignments')
          .values(assignmentRows)
          .onConflict(oc => oc.doNothing())
          .execute();
      }
    }
    return inserted.id;
  }
  const existing = await db
    .selectFrom('event_occurrences')
    .select('id')
    .where('event_series_id', '=', seriesId)
    .where('occurrence_start', '=', occurrenceStart)
    .executeTakeFirstOrThrow();
  return existing.id;
}

function serializeOccurrence(
  series: EventSeries,
  occurrence: ExpandedOccurrence,
  organization: CalendarOrganization,
  occurrenceId: number | null,
): EventOccurrenceResponse {
  return {
    occurrenceId,
    seriesId: series.id,
    title: series.title,
    description: series.description,
    isAllDay: series.is_all_day,
    siteId: series.site_id,
    roomId: series.room_id,
    reserveWholeSite: series.reserve_whole_site,
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    occurrenceStart: occurrence.occurrenceStart.toISOString(),
    start: occurrence.start.toISOString(),
    end: occurrence.end.toISOString(),
    isRescheduled: occurrence.exception?.overrideStart != null,
    isCancelled: occurrence.exception?.isCancelled ?? false,
    exceptionId: occurrence.exception?.id ?? null,
  };
}

function serializeException(exception: EventOccurrenceRow): EventExceptionResponse {
  return {
    id: exception.id,
    seriesId: exception.event_series_id,
    occurrenceStart: exception.occurrence_start.toISOString(),
    isCancelled: exception.is_cancelled,
    overrideStart: exception.override_start?.toISOString() ?? null,
    overrideEnd: exception.override_end?.toISOString() ?? null,
    createdAt: exception.created_at.toISOString(),
    updatedAt: exception.updated_at.toISOString(),
  };
}

function serializeSlot(
  slot: EventWorkRole,
  workRoleName: string | null = null,
): Omit<EventWorkRoleResponse, 'assignments'> {
  return {
    id: slot.id,
    seriesId: slot.event_series_id,

    occurrenceId: slot.event_occurrence_id,
    inheritedFromWorkRoleId: slot.inherited_from_work_role_id,
    title: slot.title,
    description: slot.description,
    isCritical: slot.is_critical,
    workRoleId: slot.work_role_id,
    workRoleName,
    createdAt: slot.created_at.toISOString(),
    updatedAt: slot.updated_at.toISOString(),
  };
}

function serializeComment(comment: EventCommentRow): EventCommentResponse {
  return {
    id: comment.id,
    seriesId: comment.event_series_id,

    userId: comment.user_id,
    userName: comment.user_name,
    body: comment.body,
    createdAt: comment.created_at.toISOString(),
    updatedAt: comment.updated_at.toISOString(),
  };
}

async function getSeriesRowOrThrow(seriesId: number): Promise<EventSeries> {
  const series = await db
    .selectFrom('event_series')
    .selectAll()
    .where('id', '=', seriesId)
    .executeTakeFirst();
  if (!series) {
    throw notFound(`Event series ${seriesId} not found!`);
  }
  return series;
}

function assertOccurrence(series: EventSeries, occurrenceStart: Date): void {
  if (!isOccurrence(toRule(series), occurrenceStart)) {
    throw notFound(
      `Occurrence ${occurrenceStart.toISOString()} is not part of event series ${series.id}!`,
    );
  }
}

async function resolveOccurrenceStart(
  series: EventSeries,
  value: string | null | undefined,
): Promise<Date | null> {
  if (value === undefined || value === null) return null;
  const date = new Date(value);
  assertOccurrence(series, date);
  return date;
}

function validateRange(rangeStart: Date, rangeEnd: Date): void {
  if (rangeEnd.getTime() <= rangeStart.getTime()) {
    throw badRequest('Occurrence range end must be after the range start!');
  }
  if (rangeEnd.getTime() - rangeStart.getTime() > MAX_OCCURRENCE_RANGE_MS) {
    throw badRequest('Occurrence range is too large (maximum is about 10 years)!');
  }
}

/**
 * Resolves the timezone for a series: the explicitly given one, or the
 * default timezone of the organization that owns the calendar.
 */
async function resolveTimezone(calendarId: string, timezone?: string): Promise<string> {
  const calendar = await db
    .selectFrom('calendars')
    .innerJoin('organizations', 'organizations.id', 'calendars.organization_id')
    .select('organizations.default_timezone')
    .where('calendars.id', '=', calendarId)
    .executeTakeFirst();
  if (!calendar) {
    throw notFound(`Calendar ${calendarId} not found!`);
  }
  if (timezone !== undefined) {
    if (!isValidTimezone(timezone)) {
      throw badRequest(`Unknown timezone: ${timezone}`);
    }
    return timezone;
  }
  return calendar.default_timezone;
}

async function fetchExceptionRules(
  seriesIds: number[],
): Promise<Map<number, OccurrenceExceptionRule[]>> {
  const bySeries = new Map<number, OccurrenceExceptionRule[]>();
  if (seriesIds.length === 0) return bySeries;
  const rows = await db
    .selectFrom('event_occurrences')
    .selectAll()
    .where('event_series_id', 'in', seriesIds)
    .where(eb => eb.or([eb('is_cancelled', '=', true), eb('override_start', 'is not', null)]))
    .orderBy('occurrence_start', 'asc')
    .execute();
  for (const row of rows) {
    const list = bySeries.get(row.event_series_id) ?? [];
    list.push(toExceptionRule(row));
    bySeries.set(row.event_series_id, list);
  }
  return bySeries;
}

async function attachAssignments(slots: EventWorkRole[]): Promise<EventWorkRoleResponse[]> {
  if (slots.length === 0) return [];

  // Fetch work role names for linked slots.
  const workRoleIds = [
    ...new Set(slots.map(j => j.work_role_id).filter((id): id is number => id !== null)),
  ];
  const workRoleNames = new Map<number, string>();
  if (workRoleIds.length > 0) {
    const rows = await db
      .selectFrom('work_roles')
      .select(['id', 'name'])
      .where('id', 'in', workRoleIds)
      .execute();
    for (const row of rows) workRoleNames.set(row.id, row.name);
  }

  const assignments = await db
    .selectFrom('event_work_role_assignments')
    .innerJoin('users', 'users.id', 'event_work_role_assignments.user_id')
    .select([
      'event_work_role_assignments.id',
      'event_work_role_assignments.event_work_role_id',
      'event_work_role_assignments.user_id',
      'event_work_role_assignments.created_at',
      'users.name as user_name',
    ])
    .where(
      'event_work_role_assignments.event_work_role_id',
      'in',
      slots.map(slot => slot.id),
    )
    .orderBy('event_work_role_assignments.id', 'asc')
    .execute();

  return slots.map(slot => ({
    ...serializeSlot(
      slot,
      slot.work_role_id !== null ? (workRoleNames.get(slot.work_role_id) ?? null) : null,
    ),
    assignments: assignments
      .filter(assignment => assignment.event_work_role_id === slot.id)
      .map(assignment => ({
        id: assignment.id,
        eventWorkRoleId: assignment.event_work_role_id,
        userId: assignment.user_id,
        userName: assignment.user_name,
        createdAt: assignment.created_at.toISOString(),
      })),
  }));
}

// --- Event series ---

export async function listEventSeries(
  organizationId: string,
  calendarId?: string,
): Promise<EventSeriesResponse[]> {
  logger.trace('eventService.listEventSeries');
  let query = db
    .selectFrom('event_series')
    .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
    .selectAll('event_series')
    .where('calendars.organization_id', '=', organizationId)
    .orderBy('start', 'asc');
  if (calendarId) {
    query = query.where('calendar_id', '=', calendarId);
  }
  const rows = await query.execute();
  return rows.map(serializeSeries);
}

export async function getEventSeries(seriesId: number): Promise<EventSeriesResponse> {
  logger.trace('eventService.getEventSeries');
  return serializeSeries(await getSeriesRowOrThrow(seriesId));
}

export async function createEventSeries(data: EventSeriesPush): Promise<EventSeriesResponse> {
  logger.trace('eventService.createEventSeries');
  const timezone = await resolveTimezone(data.calendarId, data.timezone);
  const start = new Date(data.start);
  const rrule = data.recurrence ? buildRruleString({ start, timezone }, data.recurrence) : null;

  const series = await db
    .insertInto('event_series')
    .values({
      title: data.title,
      description: data.description ?? null,
      calendar_id: data.calendarId,
      start,
      duration_minutes: data.durationMinutes ?? DEFAULT_DURATION_MINUTES,
      is_all_day: data.isAllDay ?? false,
      rrule,
      timezone,
      is_visible: data.isVisible ?? true,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return serializeSeries(series);
}

export async function updateEventSeries(
  seriesId: number,
  data: EventSeriesUpdate,
): Promise<EventSeriesResponse> {
  logger.trace('eventService.updateEventSeries');
  const existing = await getSeriesRowOrThrow(seriesId);

  const start = data.start !== undefined ? new Date(data.start) : existing.start;
  const timezone = data.timezone ?? existing.timezone;
  if (!isValidTimezone(timezone)) {
    throw badRequest(`Unknown timezone: ${timezone}`);
  }

  const calendarId = data.calendarId ?? existing.calendar_id;
  if (data.calendarId !== undefined) {
    const calendar = await db
      .selectFrom('calendars')
      .select('id')
      .where('id', '=', calendarId)
      .executeTakeFirst();
    if (!calendar) {
      throw notFound(`Calendar ${calendarId} not found!`);
    }
  }

  const rrule =
    data.recurrence !== undefined
      ? data.recurrence
        ? buildRruleString({ start, timezone }, data.recurrence)
        : null
      : existing.rrule;

  // Exceptions are keyed by occurrence start; changing the recurrence (start,
  // rule or timezone) invalidates them.
  const recurrenceChanged =
    start.getTime() !== existing.start.getTime() ||
    timezone !== existing.timezone ||
    rrule !== existing.rrule;

  return db.transaction().execute(async tx => {
    if (recurrenceChanged) {
      // Clear cancel/reschedule flags on materialized occurrences; the
      // occurrence_start keys no longer match the new recurrence.
      await tx
        .updateTable('event_occurrences')
        .set({
          is_cancelled: false,
          override_start: null,
          override_end: null,
          updated_at: new Date(),
        })
        .where('event_series_id', '=', seriesId)
        .execute();
    }

    const updated = await tx
      .updateTable('event_series')
      .set({
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        calendar_id: calendarId,
        start,
        ...(data.durationMinutes !== undefined ? { duration_minutes: data.durationMinutes } : {}),
        ...(data.isAllDay !== undefined ? { is_all_day: data.isAllDay } : {}),
        rrule,
        timezone,
        ...(data.isVisible !== undefined ? { is_visible: data.isVisible } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', seriesId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return serializeSeries(updated);
  });
}

export async function deleteEventSeries(seriesId: number): Promise<void> {
  logger.trace('eventService.deleteEventSeries');
  const result = await db.deleteFrom('event_series').where('id', '=', seriesId).executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Event series ${seriesId} not found!`);
  }
}

/**
 * Splits a series at the given occurrence ("edit this and all following"):
 * the edited occurrence begins a new, independent series with the given
 * parameters (fields not provided are inherited from the original series and
 * the start defaults to the split occurrence), the original series is
 * truncated so it ends just before the split occurrence, and all exceptions
 * from the split occurrence onwards are reset. Splitting at the very first
 * occurrence updates the series in place instead, so no empty leftover series
 * is created and series-wide work role slots and comments survive.
 * @param seriesId - The ID of the series to split.
 * @param occurrenceStart - The occurrence at which to split.
 * @param data - The updates for the new series.
 * @returns The newly created series.
 */
export async function splitEventSeries(
  seriesId: number,
  occurrenceStart: Date,
  data: EventSeriesUpdate,
): Promise<EventSeriesResponse> {
  logger.trace('eventService.splitEventSeries');
  const series = await getSeriesRowOrThrow(seriesId);
  assertOccurrence(series, occurrenceStart);

  const start = data.start !== undefined ? new Date(data.start) : occurrenceStart;
  const timezone = data.timezone ?? series.timezone;
  if (!isValidTimezone(timezone)) {
    throw badRequest(`Unknown timezone: ${timezone}`);
  }

  const calendarId = data.calendarId ?? series.calendar_id;
  if (data.calendarId !== undefined) {
    const calendar = await db
      .selectFrom('calendars')
      .select('id')
      .where('id', '=', calendarId)
      .executeTakeFirst();
    if (!calendar) {
      throw notFound(`Calendar ${calendarId} not found!`);
    }
  }

  // The recurrence is either given explicitly (null makes the new series a
  // one-off event) or inherited from the original series, re-anchored so the
  // new start is an occurrence of the rule.
  let recurrence: RecurrenceInput | null;
  if (data.recurrence !== undefined) {
    recurrence = data.recurrence;
  } else if (series.rrule) {
    recurrence = anchorRecurrenceAtStart(
      recurrenceFromRruleString(series, series.rrule),
      toWallClockDate(start, timezone),
    );
  } else {
    recurrence = null;
  }

  const durationMinutes = data.durationMinutes ?? series.duration_minutes;
  if (recurrence) {
    // The new series must contain its start occurrence.
    const newRule: RecurrenceSeriesRule = {
      start,
      durationMinutes,
      rrule: buildRruleString({ start, timezone }, recurrence),
      timezone,
    };
    if (!isOccurrence(newRule, start)) {
      throw badRequest('The start must be an occurrence of the recurrence rule!');
    }
  }

  const title = data.title ?? series.title;
  const description = data.description !== undefined ? data.description : series.description;
  const isAllDay = data.isAllDay ?? series.is_all_day;
  const isVisible = data.isVisible ?? series.is_visible;
  const rrule = recurrence ? buildRruleString({ start, timezone }, recurrence) : null;

  // Whether the split occurrence is the first occurrence of the series.
  const earlierOccurrences = expandOccurrences(
    toRule(series),
    [],
    new Date(series.start.getTime() - 1),
    occurrenceStart,
  );
  const isFirstOccurrence = earlierOccurrences.length === 0;

  return db.transaction().execute(async tx => {
    if (isFirstOccurrence) {
      const updated = await tx
        .updateTable('event_series')
        .set({
          title,
          description,
          calendar_id: calendarId,
          site_id: series.site_id,
          room_id: series.room_id,
          reserve_whole_site: series.reserve_whole_site,
          start,
          duration_minutes: durationMinutes,
          is_all_day: isAllDay,
          rrule,
          timezone,
          is_visible: isVisible,
          updated_at: new Date(),
        })
        .where('id', '=', seriesId)
        .returningAll()
        .executeTakeFirstOrThrow();
      await tx
        .updateTable('event_occurrences')
        .set({
          is_cancelled: false,
          override_start: null,
          override_end: null,
          updated_at: new Date(),
        })
        .where('event_series_id', '=', seriesId)
        .where('occurrence_start', '>=', occurrenceStart)
        .execute();
      return serializeSeries(updated);
    }

    // Truncate the original series so it ends just before the split
    // occurrence, and reset all exceptions from the split occurrence onwards.
    if (series.rrule) {
      const truncatedRrule = truncateRruleString(series, series.rrule, occurrenceStart);
      await tx
        .updateTable('event_series')
        .set({ rrule: truncatedRrule, updated_at: new Date() })
        .where('id', '=', seriesId)
        .execute();
    }
    await tx
      .updateTable('event_occurrences')
      .set({
        is_cancelled: false,
        override_start: null,
        override_end: null,
        updated_at: new Date(),
      })
      .where('event_series_id', '=', seriesId)
      .where('occurrence_start', '>=', occurrenceStart)
      .execute();

    const created = await tx
      .insertInto('event_series')
      .values({
        title,
        description,
        calendar_id: calendarId,
        site_id: series.site_id,
        room_id: series.room_id,
        reserve_whole_site: series.reserve_whole_site,
        start,
        duration_minutes: durationMinutes,
        is_all_day: isAllDay,
        rrule,
        timezone,
        is_visible: isVisible,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return serializeSeries(created);
  });
}

// --- Occurrences ---

interface MySlotAssignments {
  /** Series with a series-wide work role slot assigned to the user. */
  seriesWide: Set<number>;
  /** `${seriesId}:${occurrenceStartISO}` keys of occurrence-scoped work role slots. */
  perOccurrence: Set<string>;
}

/**
 * Collects the work role slots of the given series that are assigned to the user,
 * split into series-wide slots (applying to every occurrence) and
 * occurrence-scoped slots (keyed by the original occurrence start).
 */
async function fetchMySlotAssignments(
  seriesIds: number[],
  userId: string,
): Promise<MySlotAssignments> {
  const assignments: MySlotAssignments = { seriesWide: new Set(), perOccurrence: new Set() };
  if (seriesIds.length === 0) return assignments;
  const rows = await db
    .selectFrom('event_work_roles')
    .innerJoin(
      'event_work_role_assignments',
      'event_work_role_assignments.event_work_role_id',
      'event_work_roles.id',
    )
    .select(['event_work_roles.event_series_id', 'event_work_roles.event_occurrence_id'])
    .where('event_work_role_assignments.user_id', '=', userId)
    .where('event_work_roles.event_series_id', 'in', seriesIds)
    .execute();
  // Resolve occurrence IDs to occurrence_start keys for the mine-scope filter.
  const occIds = [
    ...new Set(rows.map(r => r.event_occurrence_id).filter((id): id is number => id !== null)),
  ];
  const occStarts = new Map<number, Date>();
  if (occIds.length > 0) {
    const occRows = await db
      .selectFrom('event_occurrences')
      .select(['id', 'event_series_id', 'occurrence_start'])
      .where('id', 'in', occIds)
      .execute();
    for (const occ of occRows) {
      occStarts.set(occ.id, occ.occurrence_start);
    }
  }
  for (const row of rows) {
    if (row.event_occurrence_id === null) {
      assignments.seriesWide.add(row.event_series_id);
    } else {
      const start = occStarts.get(row.event_occurrence_id);
      if (start) {
        assignments.perOccurrence.add(`${row.event_series_id}:${start.toISOString()}`);
      }
    }
  }
  return assignments;
}

/**
 * Lists the occurrences of all visible series within a time range, optionally
 * narrowed down by organization, calendar, location, team and scope. The
 * `mine` scope keeps only occurrences the user is assigned to (via a
 * series-wide or occurrence-scoped work role slot); the `team` scope keeps only
 * series linked to a team the user belongs to.
 * @param rangeStart - Start of the range (inclusive).
 * @param rangeEnd - End of the range (inclusive).
 * @param calendarId - Optional calendar to restrict the series to.
 * @param filter - Optional location, team and scope filters.
 * @param userId - The current user, required for the `mine` and `team` scopes.
 * @param organizationId - Optional organization to restrict the series to.
 * @returns The occurrences in the range, sorted by start.
 */
export async function getOccurrences(
  rangeStart: Date,
  rangeEnd: Date,
  calendarId?: string,
  filter?: OccurrenceFilter,
  userId?: string,
  organizationId?: string,
): Promise<EventOccurrenceResponse[]> {
  logger.trace('eventService.getOccurrences');
  validateRange(rangeStart, rangeEnd);
  if (filter?.scope && filter.scope !== 'all' && !userId) {
    throw badRequest('A user is required for the selected scope!');
  }

  let query = db
    .selectFrom('event_series')
    .selectAll('event_series')
    .where('is_visible', '=', true);
  if (calendarId) {
    query = query.where('calendar_id', '=', calendarId);
  }
  if (organizationId) {
    query = query
      .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
      .where('calendars.organization_id', '=', organizationId);
  }
  if (filter?.siteId) {
    query = query.where('site_id', '=', filter.siteId);
  }
  if (filter?.roomId) {
    query = query.where('room_id', '=', filter.roomId);
  }
  if (filter?.teamId) {
    query = query
      .innerJoin('event_series_teams', 'event_series_teams.event_series_id', 'event_series.id')
      .where('event_series_teams.team_id', '=', filter.teamId);
  }
  if (filter?.scope === 'team' && userId) {
    query = query
      .innerJoin(
        'event_series_teams as scope_teams',
        'scope_teams.event_series_id',
        'event_series.id',
      )
      .innerJoin('team_members', 'team_members.team_id', 'scope_teams.team_id')
      .where('team_members.user_id', '=', userId)
      .groupBy('event_series.id');
  }
  const series = await query.orderBy('event_series.start', 'asc').execute();
  const exceptionsBySeries = await fetchExceptionRules(series.map(row => row.id));
  const organizationsByCalendar = await getCalendarOrganizations(
    series.map(row => row.calendar_id),
  );
  const myAssignments =
    filter?.scope === 'mine' && userId
      ? await fetchMySlotAssignments(
          series.map(row => row.id),
          userId,
        )
      : null;

  const occurrences: EventOccurrenceResponse[] = [];
  const allExpanded: { series: EventSeries; occurrence: ExpandedOccurrence }[] = [];
  for (const row of series) {
    const exceptions = exceptionsBySeries.get(row.id) ?? [];
    const organization = organizationsByCalendar.get(row.calendar_id);
    if (!organization) {
      throw new Error(`Organization for calendar ${row.calendar_id} not found!`);
    }
    for (const occurrence of expandOccurrences(toRule(row), exceptions, rangeStart, rangeEnd)) {
      if (myAssignments) {
        const key = `${row.id}:${occurrence.occurrenceStart.toISOString()}`;
        if (!myAssignments.seriesWide.has(row.id) && !myAssignments.perOccurrence.has(key)) {
          continue;
        }
      }
      allExpanded.push({ series: row, occurrence });
    }
  }

  // Look up already-materialized occurrence IDs (read path: never insert).
  const occurrenceIds = await lookupOccurrenceIds(
    allExpanded.map(e => ({
      seriesId: e.series.id,
      occurrenceStart: e.occurrence.occurrenceStart,
    })),
  );

  for (const { series: row, occurrence } of allExpanded) {
    const organization = organizationsByCalendar.get(row.calendar_id);
    if (!organization) {
      throw new Error(`Organization for calendar ${row.calendar_id} not found!`);
    }
    const key = `${row.id}:${occurrence.occurrenceStart.toISOString()}`;
    occurrences.push(
      serializeOccurrence(row, occurrence, organization, occurrenceIds.get(key) ?? null),
    );
  }
  occurrences.sort((a, b) => a.start.localeCompare(b.start));
  return occurrences;
}

export async function getSeriesOccurrences(
  seriesId: number,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<EventOccurrenceResponse[]> {
  logger.trace('eventService.getSeriesOccurrences');
  validateRange(rangeStart, rangeEnd);

  const series = await getSeriesRowOrThrow(seriesId);
  const organization = await getCalendarOrganizationOrThrow(series.calendar_id);
  const exceptions = (await fetchExceptionRules([seriesId])).get(seriesId) ?? [];
  const expanded = expandOccurrences(toRule(series), exceptions, rangeStart, rangeEnd);
  const occurrenceIds = await lookupOccurrenceIds(
    expanded.map(o => ({ seriesId, occurrenceStart: o.occurrenceStart })),
  );
  return expanded.map(occurrence => {
    const key = `${seriesId}:${occurrence.occurrenceStart.toISOString()}`;
    return serializeOccurrence(series, occurrence, organization, occurrenceIds.get(key) ?? null);
  });
}

export async function getOccurrenceDetail(
  seriesId: number,
  occurrenceStart: Date,
): Promise<EventOccurrenceDetailResponse> {
  logger.trace('eventService.getOccurrenceDetail');

  const series = await getSeriesRowOrThrow(seriesId);
  assertOccurrence(series, occurrenceStart);
  const organization = await getCalendarOrganizationOrThrow(series.calendar_id);

  const exceptions = (await fetchExceptionRules([seriesId])).get(seriesId) ?? [];
  const exception = exceptions.find(
    entry => entry.occurrenceStart.getTime() === occurrenceStart.getTime(),
  );

  let start = occurrenceStart;
  let end = new Date(occurrenceStart.getTime() + series.duration_minutes * 60 * 1000);
  if (exception?.overrideStart) {
    start = exception.overrideStart;
    end = exception.overrideEnd ?? new Date(start.getTime() + series.duration_minutes * 60 * 1000);
  }

  // Look up the stable ID if the occurrence has been materialized (read path:
  // do not insert).
  const occurrenceIds = await lookupOccurrenceIds([{ seriesId, occurrenceStart }]);
  const occurrenceId = occurrenceIds.get(`${seriesId}:${occurrenceStart.toISOString()}`) ?? null;

  // Slots: occurrence-level (inherited) + parent-level, plus the missing ones.
  const slots = await listEventWorkRoles(seriesId, { occurrenceStart });
  const parentWorkRoles = await listEventWorkRoles(seriesId, { parentOnly: true });
  const occurrenceWorkRoles =
    occurrenceId !== null
      ? await listEventWorkRoles(seriesId, { occurrenceId, occurrenceOnly: true })
      : [];
  // A parent slot is "missing" when the occurrence has fewer slots for that
  // work role than the parent (manual occurrence slots count too, not just
  // inherited ones). Ad-hoc slots without a work role are matched by
  // inherited_from_work_role_id only.
  const occCountByRole = new Map<number, number>();
  const inheritedParentIds = new Set<number>();
  for (const j of occurrenceWorkRoles) {
    if (j.workRoleId !== null) {
      occCountByRole.set(j.workRoleId, (occCountByRole.get(j.workRoleId) ?? 0) + 1);
    }
    if (j.inheritedFromWorkRoleId !== null) inheritedParentIds.add(j.inheritedFromWorkRoleId);
  }
  const parentCountByRole = new Map<number, number>();
  for (const j of parentWorkRoles) {
    if (j.workRoleId !== null) {
      parentCountByRole.set(j.workRoleId, (parentCountByRole.get(j.workRoleId) ?? 0) + 1);
    }
  }
  const missingParentWorkRoles = parentWorkRoles.filter(j => {
    if (j.workRoleId !== null) {
      const parentCount = parentCountByRole.get(j.workRoleId) ?? 0;
      const occCount = occCountByRole.get(j.workRoleId) ?? 0;
      if (occCount < parentCount) {
        // Consume one "missing" per parent slot beyond the occurrence count.
        occCountByRole.set(j.workRoleId, occCount + 1);
        parentCountByRole.set(j.workRoleId, parentCount - 1);
        return true;
      }
      return false;
    }
    return !inheritedParentIds.has(j.id);
  });

  const comments = await listEventComments(seriesId, occurrenceStart);
  const readiness = await computeReadiness(seriesId, occurrenceStart);

  return {
    series: serializeSeries(series),
    occurrence: {
      occurrenceId,
      seriesId: series.id,
      title: series.title,
      description: series.description,
      isAllDay: series.is_all_day,
      siteId: series.site_id,
      roomId: series.room_id,
      reserveWholeSite: series.reserve_whole_site,
      organizationId: organization.organizationId,
      organizationName: organization.organizationName,
      occurrenceStart: occurrenceStart.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      isRescheduled: exception?.overrideStart != null,
      isCancelled: exception?.isCancelled ?? false,
      exceptionId: exception?.id ?? null,
    },
    workRoles: slots,
    parentWorkRoles,
    occurrenceWorkRoles,
    missingParentWorkRoles,
    comments,
    readiness,
  };
}

/**
 * Resolves an occurrence reference to (seriesId, occurrenceStart). The ref is
 * either a numeric stable ID of a materialized occurrence, or a temporary
 * key of the form `tmp:{seriesId}:{occurrenceStartISO}` for an instance that
 * has not been materialized yet (read-only view).
 * @param ref - The occurrence reference from the URL.
 * @returns The series ID and occurrence start.
 */
export async function resolveOccurrenceRef(
  ref: string,
): Promise<{ seriesId: number; occurrenceStart: Date }> {
  logger.trace('eventService.resolveOccurrenceRef');
  if (/^\d+$/.test(ref)) {
    const occurrence = await db
      .selectFrom('event_occurrences')
      .selectAll()
      .where('id', '=', Number.parseInt(ref, 10))
      .executeTakeFirst();
    if (!occurrence) {
      throw notFound(`Event occurrence ${ref} not found!`);
    }
    return {
      seriesId: occurrence.event_series_id,
      occurrenceStart: occurrence.occurrence_start,
    };
  }
  const tmpMatch = /^tmp:(\d+):(.+)$/.exec(ref);
  if (tmpMatch) {
    const seriesId = Number.parseInt(tmpMatch[1], 10);
    const occurrenceStart = new Date(tmpMatch[2]);
    if (Number.isNaN(seriesId) || Number.isNaN(occurrenceStart.getTime())) {
      throw badRequest(`Invalid temporary occurrence reference: ${ref}`);
    }
    return { seriesId, occurrenceStart };
  }
  throw badRequest(`Invalid occurrence reference: ${ref}`);
}

/**
 * Gets the detail of a single occurrence by its reference (stable ID or
 * temporary key). Temporary refs are resolved without materializing.
 * @param ref - The occurrence reference from the URL.
 * @returns The occurrence detail.
 */
export async function getOccurrenceDetailByRef(
  ref: string,
): Promise<EventOccurrenceDetailResponse> {
  logger.trace('eventService.getOccurrenceDetailByRef');
  const { seriesId, occurrenceStart } = await resolveOccurrenceRef(ref);
  return getOccurrenceDetail(seriesId, occurrenceStart);
}

/**
 * Materializes an occurrence referenced by ref (numeric ID or tmp key) and
 * returns its stable ID. On first creation, parent slots and their
 * assignments are inherited.
 * @param ref - The occurrence reference.
 * @returns The stable occurrence ID.
 */
export async function materializeOccurrenceByRef(ref: string): Promise<number> {
  logger.trace('eventService.materializeOccurrenceByRef');
  const { seriesId, occurrenceStart } = await resolveOccurrenceRef(ref);
  return ensureOccurrenceMaterialized(seriesId, occurrenceStart);
}

/**
 * Resolves a ref to a materialized occurrence ID, materializing on write.
 * Read endpoints should use resolveOccurrenceRef + lookup instead.
 */

// --- Occurrence-scoped work role slots ---

/** Lists the work role slots scoped to a materialized occurrence. */
export async function listOccurrenceWorkRoles(
  occurrenceId: number,
): Promise<EventWorkRoleResponse[]> {
  const occ = await db
    .selectFrom('event_occurrences')
    .select('event_series_id')
    .where('id', '=', occurrenceId)
    .executeTakeFirst();
  if (!occ) throw notFound(`Event occurrence ${occurrenceId} not found!`);
  return listEventWorkRoles(occ.event_series_id, { occurrenceId, occurrenceOnly: true });
}

/** Creates a work role slot scoped to the occurrence. */
export async function createOccurrenceWorkRole(
  occurrenceId: number,
  data: EventWorkRolePush,
): Promise<EventWorkRoleResponse> {
  const occ = await db
    .selectFrom('event_occurrences')
    .select(['event_series_id', 'occurrence_start'])
    .where('id', '=', occurrenceId)
    .executeTakeFirst();
  if (!occ) throw notFound(`Event occurrence ${occurrenceId} not found!`);
  return createEventWorkRole(occ.event_series_id, {
    ...data,
    occurrenceStart: occ.occurrence_start.toISOString(),
    occurrenceId,
  });
}

async function getOccurrenceSlotOrThrow(occurrenceId: number, workRoleId: number) {
  const slot = await db
    .selectFrom('event_work_roles')
    .selectAll()
    .where('id', '=', workRoleId)
    .where('event_occurrence_id', '=', occurrenceId)
    .executeTakeFirst();
  if (!slot) {
    throw notFound(`Work role slot ${workRoleId} not found in occurrence ${occurrenceId}!`);
  }
  return slot;
}

/** Updates a slot that belongs to the occurrence (parent slots are rejected). */
export async function updateOccurrenceWorkRole(
  occurrenceId: number,
  workRoleId: number,
  data: EventWorkRoleUpdate,
): Promise<EventWorkRoleResponse> {
  const slot = await getOccurrenceSlotOrThrow(occurrenceId, workRoleId);
  return updateEventWorkRole(slot.event_series_id, workRoleId, data);
}

/** Deletes a slot that belongs to the occurrence; parent slots are never deleted. */
export async function deleteOccurrenceWorkRole(
  occurrenceId: number,
  workRoleId: number,
): Promise<void> {
  await getOccurrenceSlotOrThrow(occurrenceId, workRoleId);
  await db.deleteFrom('event_work_roles').where('id', '=', workRoleId).execute();
}

/** Assigns a user to an occurrence slot. */
export async function assignUserToOccurrenceWorkRole(
  occurrenceId: number,
  workRoleId: number,
  userId: string,
): Promise<EventWorkRoleAssignmentResponse> {
  const slot = await getOccurrenceSlotOrThrow(occurrenceId, workRoleId);
  return assignUserToWorkRole(slot.event_series_id, workRoleId, userId);
}

/** Removes an assignment from an occurrence slot. */
export async function unassignUserFromOccurrenceWorkRole(
  occurrenceId: number,
  workRoleId: number,
  assignmentId: number,
): Promise<void> {
  const slot = await getOccurrenceSlotOrThrow(occurrenceId, workRoleId);
  return unassignUserFromWorkRole(slot.event_series_id, workRoleId, assignmentId);
}

// --- Occurrence-scoped comments ---

/** Lists comments scoped to the occurrence (plus series-wide ones). */
export async function listOccurrenceComments(
  occurrenceId: number,
): Promise<EventCommentResponse[]> {
  const occ = await db
    .selectFrom('event_occurrences')
    .select(['event_series_id', 'occurrence_start'])
    .where('id', '=', occurrenceId)
    .executeTakeFirst();
  if (!occ) throw notFound(`Event occurrence ${occurrenceId} not found!`);
  return listEventComments(occ.event_series_id, occ.occurrence_start);
}

/** Creates a comment scoped to the occurrence. */
export async function createOccurrenceComment(
  occurrenceId: number,
  userId: string,
  data: EventCommentPush,
): Promise<EventCommentResponse> {
  const occ = await db
    .selectFrom('event_occurrences')
    .select(['event_series_id', 'occurrence_start'])
    .where('id', '=', occurrenceId)
    .executeTakeFirst();
  if (!occ) throw notFound(`Event occurrence ${occurrenceId} not found!`);
  return createEventComment(occ.event_series_id, userId, {
    ...data,
    occurrenceStart: occ.occurrence_start.toISOString(),
  });
}

async function getOccurrenceCommentOrThrow(occurrenceId: number, commentId: number) {
  const comment = await db
    .selectFrom('event_comments')
    .selectAll()
    .where('id', '=', commentId)
    .where('event_occurrence_id', '=', occurrenceId)
    .executeTakeFirst();
  if (!comment) {
    throw notFound(`Comment ${commentId} not found in occurrence ${occurrenceId}!`);
  }
  return comment;
}

/** Updates a comment that belongs to the occurrence (author only). */
export async function updateOccurrenceComment(
  occurrenceId: number,
  commentId: number,
  userId: string,
  data: EventCommentUpdate,
): Promise<EventCommentResponse> {
  const comment = await getOccurrenceCommentOrThrow(occurrenceId, commentId);
  return updateEventComment(comment.event_series_id, commentId, userId, data);
}

/** Deletes a comment that belongs to the occurrence (author only). */
export async function deleteOccurrenceComment(
  occurrenceId: number,
  commentId: number,
  userId: string,
): Promise<void> {
  const comment = await getOccurrenceCommentOrThrow(occurrenceId, commentId);
  return deleteEventComment(comment.event_series_id, commentId, userId);
}

// --- Occurrence exceptions (cancel / reschedule) ---

export async function listExceptions(seriesId: number): Promise<EventExceptionResponse[]> {
  logger.trace('eventService.listExceptions');
  await getSeriesRowOrThrow(seriesId);
  const rows = await db
    .selectFrom('event_occurrences')
    .selectAll()
    .where('event_series_id', '=', seriesId)
    .where(eb => eb.or([eb('is_cancelled', '=', true), eb('override_start', 'is not', null)]))
    .orderBy('occurrence_start', 'asc')
    .execute();
  return rows.map(serializeException);
}

export async function cancelOccurrence(
  seriesId: number,
  occurrenceStart: Date,
): Promise<EventExceptionResponse> {
  logger.trace('eventService.cancelOccurrence');
  const series = await getSeriesRowOrThrow(seriesId);
  assertOccurrence(series, occurrenceStart);

  // Materialize the occurrence on write (an exception attaches data to it).
  await ensureOccurrenceMaterialized(seriesId, occurrenceStart);

  const exception = await db
    .insertInto('event_occurrences')
    .values({
      event_series_id: seriesId,
      occurrence_start: occurrenceStart,
      is_cancelled: true,
    })
    .onConflict(oc =>
      oc
        .columns(['event_series_id', 'occurrence_start'])
        .doUpdateSet({ is_cancelled: true, updated_at: new Date() }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  return serializeException(exception);
}

export async function rescheduleOccurrence(
  seriesId: number,
  occurrenceStart: Date,
  data: RescheduleOccurrenceInput,
): Promise<EventExceptionResponse> {
  logger.trace('eventService.rescheduleOccurrence');
  const series = await getSeriesRowOrThrow(seriesId);
  assertOccurrence(series, occurrenceStart);

  // Materialize the occurrence on write (an exception attaches data to it).
  await ensureOccurrenceMaterialized(seriesId, occurrenceStart);

  const start = new Date(data.start);
  const end = data.end
    ? new Date(data.end)
    : new Date(start.getTime() + series.duration_minutes * 60 * 1000);
  if (end.getTime() <= start.getTime()) {
    throw badRequest('Rescheduled end must be after the rescheduled start!');
  }

  const exception = await db
    .insertInto('event_occurrences')
    .values({
      event_series_id: seriesId,
      occurrence_start: occurrenceStart,
      is_cancelled: false,
      override_start: start,
      override_end: end,
    })
    .onConflict(oc =>
      oc.columns(['event_series_id', 'occurrence_start']).doUpdateSet({
        is_cancelled: false,
        override_start: start,
        override_end: end,
        updated_at: new Date(),
      }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();

  return serializeException(exception);
}

export async function deleteException(seriesId: number, occurrenceStart: Date): Promise<void> {
  logger.trace('eventService.deleteException');
  await getSeriesRowOrThrow(seriesId);

  // Clear the cancel/reschedule flags but keep the occurrence row (and its
  // attached slots/comments) intact.
  const result = await db
    .updateTable('event_occurrences')
    .set({
      is_cancelled: false,
      override_start: null,
      override_end: null,
      updated_at: new Date(),
    })
    .where('event_series_id', '=', seriesId)
    .where('occurrence_start', '=', occurrenceStart)
    .executeTakeFirst();
  if (Number(result.numUpdatedRows ?? 0n) === 0) {
    throw notFound(
      `No exception for occurrence ${occurrenceStart.toISOString()} in event series ${seriesId}!`,
    );
  }
}

// --- Work role slots ---

/**
 * Lists work role slots of a series. When `occurrenceId` is given, returns
 * only slots scoped to that occurrence; when `parentOnly` is true, returns
 * only series-level (parent template) slots; when `occurrenceStart` is given,
 * resolves it to the occurrence ID and returns parent + occurrence slots.
 */
export async function listEventWorkRoles(
  seriesId: number,
  options?: {
    occurrenceStart?: Date;
    occurrenceId?: number | null;
    parentOnly?: boolean;
    occurrenceOnly?: boolean;
  },
): Promise<EventWorkRoleResponse[]> {
  logger.trace('eventService.listEventWorkRoles');
  await getSeriesRowOrThrow(seriesId);

  // Resolve occurrenceStart to an occurrence ID (lookup only, no insert).
  let occurrenceId = options?.occurrenceId ?? null;
  if (occurrenceId === null && options?.occurrenceStart) {
    const occ = await db
      .selectFrom('event_occurrences')
      .select('id')
      .where('event_series_id', '=', seriesId)
      .where('occurrence_start', '=', options.occurrenceStart)
      .executeTakeFirst();
    occurrenceId = occ?.id ?? null;
  }
  const occurrenceRequested =
    options?.occurrenceId !== undefined || options?.occurrenceStart !== undefined;

  let query = db.selectFrom('event_work_roles').selectAll().where('event_series_id', '=', seriesId);
  if (options?.parentOnly) {
    query = query.where('event_occurrence_id', 'is', null);
  } else if (options?.occurrenceOnly) {
    query = query.where('event_occurrence_id', '=', occurrenceId ?? -1);
  } else if (occurrenceId !== null) {
    // Parent slots + slots scoped to this occurrence.
    query = query.where(eb =>
      eb.or([eb('event_occurrence_id', 'is', null), eb('event_occurrence_id', '=', occurrenceId)]),
    );
  } else if (occurrenceRequested) {
    // An occurrence was requested but is not materialized: only parent
    // (series-level) slots are visible for it, never slots scoped to other
    // occurrences.
    query = query.where('event_occurrence_id', 'is', null);
  }
  const slots = await query.orderBy('id', 'asc').execute();
  return attachAssignments(slots);
}

export async function createEventWorkRole(
  seriesId: number,
  data: EventWorkRolePush,
): Promise<EventWorkRoleResponse> {
  logger.trace('eventService.createEventWorkRole');
  const series = await getSeriesRowOrThrow(seriesId);
  const occurrenceStart = await resolveOccurrenceStart(series, data.occurrenceStart);

  // Materialize the occurrence on write so the slot has a stable instance ID.
  let eventOccurrenceId: number | null = data.occurrenceId ?? null;
  if (occurrenceStart && eventOccurrenceId === null) {
    eventOccurrenceId = await ensureOccurrenceMaterialized(seriesId, occurrenceStart);
  }
  if (data.occurrenceId != null) {
    // Validate the occurrence belongs to this series.
    const occ = await db
      .selectFrom('event_occurrences')
      .select('id')
      .where('id', '=', data.occurrenceId)
      .where('event_series_id', '=', seriesId)
      .executeTakeFirst();
    if (!occ) {
      throw notFound(`Occurrence ${data.occurrenceId} not found in event series ${seriesId}!`);
    }
  }

  // Validate the work role if given; default the title from the work role.
  let workRoleName: string | null = null;
  if (data.workRoleId != null) {
    const workRole = await db
      .selectFrom('work_roles')
      .select(['id', 'name'])
      .where('id', '=', data.workRoleId)
      .executeTakeFirst();
    if (!workRole) {
      throw notFound(`Work role ${data.workRoleId} not found!`);
    }
    workRoleName = workRole.name;
  }

  const slot = await db
    .insertInto('event_work_roles')
    .values({
      event_series_id: seriesId,
      event_occurrence_id: eventOccurrenceId,
      inherited_from_work_role_id: null,
      title: data.title || workRoleName || 'Slot',
      description: data.description ?? '',
      is_critical: data.isCritical ?? false,
      work_role_id: data.workRoleId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return (await attachAssignments([slot]))[0];
}

export async function updateEventWorkRole(
  seriesId: number,
  slotId: number,
  data: EventWorkRoleUpdate,
): Promise<EventWorkRoleResponse> {
  logger.trace('eventService.updateEventWorkRole');
  const series = await getSeriesRowOrThrow(seriesId);

  const slot = await db
    .selectFrom('event_work_roles')
    .selectAll()
    .where('id', '=', slotId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (!slot) {
    throw notFound(`Work role slot ${slotId} not found in event series ${seriesId}!`);
  }

  // Validate the work role if given.
  if (data.workRoleId != null) {
    const workRole = await db
      .selectFrom('work_roles')
      .select('id')
      .where('id', '=', data.workRoleId)
      .executeTakeFirst();
    if (!workRole) {
      throw notFound(`Work role ${data.workRoleId} not found!`);
    }
  }

  const update: Record<string, unknown> = { updated_at: new Date() };
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.isCritical !== undefined) update.is_critical = data.isCritical;
  if (data.workRoleId !== undefined) update.work_role_id = data.workRoleId;
  if (data.occurrenceStart !== undefined) {
    update.occurrence_start =
      data.occurrenceStart === null
        ? null
        : await resolveOccurrenceStart(series, data.occurrenceStart);
  }

  const updated = await db
    .updateTable('event_work_roles')
    .set(update)
    .where('id', '=', slotId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return (await attachAssignments([updated]))[0];
}

export async function deleteEventWorkRole(
  seriesId: number,
  slotId: number,
  occurrenceRef?: string,
): Promise<void> {
  logger.trace('eventService.deleteEventWorkRole');
  await getSeriesRowOrThrow(seriesId);

  // When an occurrence ref is given (occurrence page), never delete the
  // parent slot: materialize the occurrence if needed and delete only the
  // occurrence-level copy inherited from this parent slot.
  if (occurrenceRef !== undefined) {
    const { seriesId: refSeriesId, occurrenceStart } = await resolveOccurrenceRef(occurrenceRef);
    if (refSeriesId !== seriesId) {
      throw badRequest('Occurrence does not belong to this event series!');
    }
    const occId = await ensureOccurrenceMaterialized(seriesId, occurrenceStart);
    const result = await db
      .deleteFrom('event_work_roles')
      .where('event_series_id', '=', seriesId)
      .where('event_occurrence_id', '=', occId)
      .where('inherited_from_work_role_id', '=', slotId)
      .executeTakeFirst();
    if (result.numDeletedRows === 0n) {
      // Maybe the occurrence slot was added manually (not inherited): delete
      // the occurrence-level slot with this id if it belongs to the occurrence.
      const slot = await db
        .selectFrom('event_work_roles')
        .select(['id', 'event_occurrence_id'])
        .where('id', '=', slotId)
        .where('event_series_id', '=', seriesId)
        .executeTakeFirst();
      if (slot && slot.event_occurrence_id === occId) {
        await db.deleteFrom('event_work_roles').where('id', '=', slotId).execute();
        return;
      }
      throw notFound(
        `Work role slot ${slotId} has no occurrence-level copy in occurrence ${occurrenceRef}!`,
      );
    }
    return;
  }

  const result = await db
    .deleteFrom('event_work_roles')
    .where('id', '=', slotId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Work role slot ${slotId} not found in event series ${seriesId}!`);
  }
}

export async function assignUserToWorkRole(
  seriesId: number,
  slotId: number,
  userId: string,
): Promise<EventWorkRoleAssignmentResponse> {
  logger.trace('eventService.assignUserToWorkRole');
  await getSeriesRowOrThrow(seriesId);

  const slot = await db
    .selectFrom('event_work_roles')
    .select(['id', 'event_occurrence_id'])
    .where('id', '=', slotId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (!slot) {
    throw notFound(`Work role slot ${slotId} not found in event series ${seriesId}!`);
  }

  const user = await db
    .selectFrom('users')
    .select(['id', 'name'])
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) {
    throw notFound(`User ${userId} not found!`);
  }

  try {
    const assignment = await db
      .insertInto('event_work_role_assignments')
      .values({ event_work_role_id: slotId, user_id: userId })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: assignment.id,
      eventWorkRoleId: assignment.event_work_role_id,
      userId: assignment.user_id,
      userName: user.name,
      createdAt: assignment.created_at.toISOString(),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest('User is already assigned to this work role slot!');
    }
    throw error;
  }
}

export async function unassignUserFromWorkRole(
  seriesId: number,
  slotId: number,
  assignmentId: number,
): Promise<void> {
  logger.trace('eventService.unassignUserFromWorkRole');
  await getSeriesRowOrThrow(seriesId);

  const assignment = await db
    .selectFrom('event_work_role_assignments')
    .innerJoin(
      'event_work_roles',
      'event_work_roles.id',
      'event_work_role_assignments.event_work_role_id',
    )
    .select([
      'event_work_role_assignments.id',
      'event_work_role_assignments.event_work_role_id',
      'event_work_roles.event_series_id',
    ])
    .where('event_work_role_assignments.id', '=', assignmentId)
    .executeTakeFirst();
  if (
    !assignment ||
    assignment.event_work_role_id !== slotId ||
    assignment.event_series_id !== seriesId
  ) {
    throw notFound(`Assignment ${assignmentId} not found in event series ${seriesId}!`);
  }

  await db.deleteFrom('event_work_role_assignments').where('id', '=', assignmentId).execute();
}

// --- Work role slots: import from parent ---

/**
 * Imports parent (series-level) slots into a materialized occurrence. Only
 * slots whose ID is not already referenced by an occurrence slot's
 * `inherited_from_work_role_id` are copied. Existing occurrence slots are never
 * modified or deleted.
 * @param seriesId - The series ID.
 * @param occurrenceId - The occurrence ID.
 * @param occurrenceStart - The occurrence start (stamped on inherited slots).
 * @returns The newly imported slots.
 */
export async function importParentSlots(
  seriesId: number,
  occurrenceId: number,
  _occurrenceStart?: Date,
): Promise<EventWorkRoleResponse[]> {
  logger.trace('eventService.importParentSlots');
  await getSeriesRowOrThrow(seriesId);

  const occ = await db
    .selectFrom('event_occurrences')
    .select(['id', 'occurrence_start'])
    .where('id', '=', occurrenceId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (!occ) {
    throw notFound(`Occurrence ${occurrenceId} not found in event series ${seriesId}!`);
  }

  // Parent slots not yet inherited.
  const parentSlots = await db
    .selectFrom('event_work_roles')
    .select(['id', 'title', 'description', 'is_critical', 'work_role_id'])
    .where('event_series_id', '=', seriesId)
    .where('event_occurrence_id', 'is', null)
    .where(eb =>
      eb.not(
        eb.exists(
          db
            .selectFrom('event_work_roles as occ_slot')
            .select('occ_slot.id')
            .where('occ_slot.event_occurrence_id', '=', occurrenceId)
            .whereRef('occ_slot.inherited_from_work_role_id', '=', 'event_work_roles.id' as never),
        ),
      ),
    )
    .execute();

  if (parentSlots.length === 0) return [];

  const inserted = await db
    .insertInto('event_work_roles')
    .values(
      parentSlots.map(s => ({
        event_series_id: seriesId,
        event_occurrence_id: occurrenceId,
        inherited_from_work_role_id: s.id,
        title: s.title,
        description: s.description,
        is_critical: s.is_critical,
        work_role_id: s.work_role_id,
      })),
    )
    .onConflict(oc => oc.doNothing())
    .returningAll()
    .execute();

  return attachAssignments(inserted);
}

/**
 * Computes the readiness of an event occurrence based on its work role slots
 * and current assignments. Uses occurrence-level slots when the occurrence is
 * materialized, otherwise parent (series-level) slots. Each critical slot
 * must have at least one assignee; roles are grouped by work role for display.
 * @param seriesId - The series ID.
 * @param occurrenceStart - The occurrence start.
 * @returns The readiness summary.
 */
export async function computeReadiness(
  seriesId: number,
  occurrenceStart: Date,
): Promise<EventReadiness> {
  logger.trace('eventService.computeReadiness');

  // Determine the occurrence ID (if materialized).
  const occRow = await db
    .selectFrom('event_occurrences')
    .select('id')
    .where('event_series_id', '=', seriesId)
    .where('occurrence_start', '=', occurrenceStart)
    .executeTakeFirst();
  const occurrenceId = occRow?.id ?? null;

  // Load slots: occurrence-level if materialized, else parent-level.
  let slotRows = await db
    .selectFrom('event_work_roles')
    .leftJoin('work_roles', 'work_roles.id', 'event_work_roles.work_role_id')
    .select([
      'event_work_roles.id',
      'event_work_roles.title',
      'event_work_roles.work_role_id',
      'event_work_roles.is_critical',
      'work_roles.name as work_role_name',
    ])
    .where('event_work_roles.event_series_id', '=', seriesId)
    .where('event_work_roles.event_occurrence_id', '=', occurrenceId ?? -1)
    .execute();
  if (slotRows.length === 0) {
    slotRows = await db
      .selectFrom('event_work_roles')
      .leftJoin('work_roles', 'work_roles.id', 'event_work_roles.work_role_id')
      .select([
        'event_work_roles.id',
        'event_work_roles.title',
        'event_work_roles.work_role_id',
        'event_work_roles.is_critical',
        'work_roles.name as work_role_name',
      ])
      .where('event_work_roles.event_series_id', '=', seriesId)
      .where('event_work_roles.event_occurrence_id', 'is', null)
      .execute();
  }

  if (slotRows.length === 0) {
    return { roles: [], isReady: true, unfilledCriticalCount: 0 };
  }

  // Count assignments per slot.
  const slotIds = slotRows.map(s => s.id);
  const assignmentCounts = new Map<number, number>();
  const rows = await db
    .selectFrom('event_work_role_assignments')
    .select(['event_work_role_id', db.fn.countAll().as('count')])
    .where('event_work_role_id', 'in', slotIds)
    .groupBy('event_work_role_id')
    .execute();
  for (const row of rows) {
    assignmentCounts.set(row.event_work_role_id, Number(row.count));
  }

  // Group by work role for display; each slot counts as one required person.
  const byRole = new Map<string, RoleReadiness>();
  let unfilledCriticalCount = 0;
  for (const slot of slotRows) {
    const key = slot.work_role_id !== null ? String(slot.work_role_id) : `adhoc:${slot.id}`;
    const name = slot.work_role_name ?? slot.title ?? 'Slot';
    let entry = byRole.get(key);
    if (!entry) {
      entry = {
        workRoleId: slot.work_role_id,
        workRoleName: name,
        required: 0,
        filled: 0,
        isCritical: slot.is_critical,
        isUnfilled: false,
      };
      byRole.set(key, entry);
    }
    entry.required += 1;
    const filled = (assignmentCounts.get(slot.id) ?? 0) > 0;
    if (filled) entry.filled += 1;
    if (slot.is_critical && !filled) {
      entry.isUnfilled = true;
      unfilledCriticalCount += 1;
    }
    if (slot.is_critical) entry.isCritical = true;
  }

  return {
    roles: [...byRole.values()],
    isReady: unfilledCriticalCount === 0,
    unfilledCriticalCount,
  };
}

// --- Comments ---

const commentSelect = [
  'event_comments.id',
  'event_comments.event_series_id',
  'event_comments.event_occurrence_id',
  'event_comments.user_id',
  'event_comments.body',
  'event_comments.created_at',
  'event_comments.updated_at',
  'users.name as user_name',
] as const;

export async function listEventComments(
  seriesId: number,
  occurrenceStart?: Date,
): Promise<EventCommentResponse[]> {
  logger.trace('eventService.listEventComments');
  await getSeriesRowOrThrow(seriesId);

  let query = db
    .selectFrom('event_comments')
    .innerJoin('users', 'users.id', 'event_comments.user_id')
    .select(commentSelect)
    .where('event_comments.event_series_id', '=', seriesId);
  if (occurrenceStart) {
    const occ = await db
      .selectFrom('event_occurrences')
      .select('id')
      .where('event_series_id', '=', seriesId)
      .where('occurrence_start', '=', occurrenceStart)
      .executeTakeFirst();
    const occId = occ?.id ?? -1;
    query = query.where(eb =>
      eb.or([
        eb('event_comments.event_occurrence_id', 'is', null),
        eb('event_comments.event_occurrence_id', '=', occId),
      ]),
    );
  }
  const rows = await query.orderBy('event_comments.id', 'asc').execute();
  return rows.map(serializeComment);
}

export async function createEventComment(
  seriesId: number,
  userId: string,
  data: EventCommentPush,
): Promise<EventCommentResponse> {
  logger.trace('eventService.createEventComment');
  const series = await getSeriesRowOrThrow(seriesId);
  const occurrenceStart = await resolveOccurrenceStart(series, data.occurrenceStart);

  // Materialize the occurrence on write.
  let eventOccurrenceId: number | null = null;
  if (occurrenceStart) {
    eventOccurrenceId = await ensureOccurrenceMaterialized(seriesId, occurrenceStart);
  }

  const user = await db
    .selectFrom('users')
    .select('name')
    .where('id', '=', userId)
    .executeTakeFirst();
  if (!user) {
    throw notFound(`User ${userId} not found!`);
  }

  const comment = await db
    .insertInto('event_comments')
    .values({
      event_series_id: seriesId,
      event_occurrence_id: eventOccurrenceId,
      user_id: userId,
      body: data.body,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return serializeComment({ ...comment, user_name: user.name });
}

async function getCommentOrThrow(seriesId: number, commentId: number): Promise<EventCommentRow> {
  const comment = await db
    .selectFrom('event_comments')
    .innerJoin('users', 'users.id', 'event_comments.user_id')
    .select(commentSelect)
    .where('event_comments.id', '=', commentId)
    .where('event_comments.event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (!comment) {
    throw notFound(`Comment ${commentId} not found in event series ${seriesId}!`);
  }
  return comment;
}

export async function updateEventComment(
  seriesId: number,
  commentId: number,
  userId: string,
  data: EventCommentUpdate,
): Promise<EventCommentResponse> {
  logger.trace('eventService.updateEventComment');
  const comment = await getCommentOrThrow(seriesId, commentId);
  if (comment.user_id !== userId) {
    throw forbidden('Only the comment author can edit this comment!');
  }

  const updated = await db
    .updateTable('event_comments')
    .set({ body: data.body, updated_at: new Date() })
    .where('id', '=', commentId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return serializeComment({ ...updated, user_name: comment.user_name });
}

export async function deleteEventComment(
  seriesId: number,
  commentId: number,
  userId: string,
): Promise<void> {
  logger.trace('eventService.deleteEventComment');
  const comment = await getCommentOrThrow(seriesId, commentId);
  if (comment.user_id !== userId) {
    throw forbidden('Only the comment author can delete this comment!');
  }

  await db.deleteFrom('event_comments').where('id', '=', commentId).execute();
}
// --- Event series management (site/room, teams, paginated listing) ---

export interface EventSeriesTeamResponse {
  id: string;
  name: string;
}

export interface EventSeriesManagementResponse extends EventSeriesResponse {
  organizationId: string;
  organizationName: string;
  siteName: string | null;
  roomName: string | null;
  teams: EventSeriesTeamResponse[];
}

export interface PaginatedEventSeries {
  items: EventSeriesManagementResponse[];
  total: number;
  page: number;
  limit: number;
}

async function getSiteNames(siteIds: (string | null)[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(siteIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return result;
  const rows = await db.selectFrom('sites').select(['id', 'name']).where('id', 'in', ids).execute();
  for (const row of rows) {
    result.set(row.id, row.name);
  }
  return result;
}

async function getRoomNames(roomIds: (string | null)[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const ids = [...new Set(roomIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return result;
  const rows = await db.selectFrom('rooms').select(['id', 'name']).where('id', 'in', ids).execute();
  for (const row of rows) {
    result.set(row.id, row.name);
  }
  return result;
}

async function getSeriesTeamsMap(
  seriesIds: number[],
): Promise<Map<number, EventSeriesTeamResponse[]>> {
  const result = new Map<number, EventSeriesTeamResponse[]>();
  if (seriesIds.length === 0) return result;
  const rows = await db
    .selectFrom('event_series_teams')
    .innerJoin('teams', 'teams.id', 'event_series_teams.team_id')
    .select([
      'event_series_teams.event_series_id',
      'teams.id as team_id',
      'teams.name as team_name',
    ])
    .where('event_series_teams.event_series_id', 'in', seriesIds)
    .orderBy('teams.name', 'asc')
    .execute();
  for (const row of rows) {
    const list = result.get(row.event_series_id) ?? [];
    list.push({ id: row.team_id, name: row.team_name });
    result.set(row.event_series_id, list);
  }
  return result;
}

function serializeSeriesManagement(
  series: EventSeries,
  organization: CalendarOrganization,
  siteName: string | null,
  roomName: string | null,
  teams: EventSeriesTeamResponse[],
): EventSeriesManagementResponse {
  return {
    ...serializeSeries(series),
    organizationId: organization.organizationId,
    organizationName: organization.organizationName,
    siteName,
    roomName,
    teams,
  };
}

/**
 * Lists event series with pagination, search and filters for the management view.
 * @param query - The filter and pagination parameters.
 * @returns Paginated event series.
 */
export async function listEventSeriesPaginated(query: {
  page?: number;
  limit?: number;
  search?: string;
  startFrom?: string;
  startTo?: string;
  siteId?: string;
  roomId?: string;
  teamId?: string;
  hasTeam?: boolean;
  organizationId: string;
}): Promise<PaginatedEventSeries> {
  logger.trace('eventService.listEventSeriesPaginated');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db
    .selectFrom('event_series')
    .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
    .selectAll('event_series')
    .where('calendars.organization_id', '=', query.organizationId);
  let countQuery = db
    .selectFrom('event_series')
    .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
    .select(db.fn.countAll().as('count'))
    .where('calendars.organization_id', '=', query.organizationId);

  if (search) {
    baseQuery = baseQuery.where('event_series.title', 'ilike', `%${search}%`);
    countQuery = countQuery.where('event_series.title', 'ilike', `%${search}%`);
  }

  if (query.startFrom) {
    const from = new Date(query.startFrom);
    baseQuery = baseQuery.where('event_series.start', '>=', from);
    countQuery = countQuery.where('event_series.start', '>=', from);
  }

  if (query.startTo) {
    const to = new Date(query.startTo);
    baseQuery = baseQuery.where('event_series.start', '<=', to);
    countQuery = countQuery.where('event_series.start', '<=', to);
  }

  if (query.siteId) {
    baseQuery = baseQuery.where('event_series.site_id', '=', query.siteId);
    countQuery = countQuery.where('event_series.site_id', '=', query.siteId);
  }

  if (query.roomId) {
    baseQuery = baseQuery.where('event_series.room_id', '=', query.roomId);
    countQuery = countQuery.where('event_series.room_id', '=', query.roomId);
  }

  if (query.teamId) {
    baseQuery = baseQuery
      .innerJoin('event_series_teams', 'event_series_teams.event_series_id', 'event_series.id')
      .where('event_series_teams.team_id', '=', query.teamId)
      .groupBy('event_series.id');
    countQuery = countQuery
      .innerJoin('event_series_teams', 'event_series_teams.event_series_id', 'event_series.id')
      .where('event_series_teams.team_id', '=', query.teamId);
  }

  if (query.hasTeam !== undefined) {
    if (query.hasTeam) {
      baseQuery = baseQuery
        .innerJoin('event_series_teams', 'event_series_teams.event_series_id', 'event_series.id')
        .groupBy('event_series.id');
      countQuery = countQuery.innerJoin(
        'event_series_teams',
        'event_series_teams.event_series_id',
        'event_series.id',
      );
    } else {
      baseQuery = baseQuery
        .leftJoin('event_series_teams', 'event_series_teams.event_series_id', 'event_series.id')
        .where('event_series_teams.id', 'is', null)
        .groupBy('event_series.id');
      countQuery = countQuery
        .leftJoin('event_series_teams', 'event_series_teams.event_series_id', 'event_series.id')
        .where('event_series_teams.id', 'is', null);
    }
  }

  const [rows, countRow] = await Promise.all([
    baseQuery
      .orderBy('event_series.title', 'asc')
      .limit(limit)
      .offset(page * limit)
      .execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const siteNames = await getSiteNames(rows.map(r => r.site_id));
  const roomNames = await getRoomNames(rows.map(r => r.room_id));
  const teamsMap = await getSeriesTeamsMap(rows.map(r => r.id));
  const organizationsByCalendar = await getCalendarOrganizations(rows.map(r => r.calendar_id));

  const items = rows.map(row => {
    const organization = organizationsByCalendar.get(row.calendar_id);
    if (!organization) {
      throw new Error(`Organization for calendar ${row.calendar_id} not found!`);
    }
    return serializeSeriesManagement(
      row as EventSeries,
      organization,
      row.site_id ? (siteNames.get(row.site_id) ?? null) : null,
      row.room_id ? (roomNames.get(row.room_id) ?? null) : null,
      teamsMap.get(row.id) ?? [],
    );
  });

  return {
    items,
    total: Number(countRow.count),
    page,
    limit,
  };
}

/**
 * Gets a single event series with its site/room and teams for the management view.
 * @param seriesId - The series ID.
 * @returns The series with site/room and teams.
 */
export async function getEventSeriesManagement(
  seriesId: number,
): Promise<EventSeriesManagementResponse> {
  logger.trace('eventService.getEventSeriesManagement');
  const series = await getSeriesRowOrThrow(seriesId);
  const organization = await getCalendarOrganizationOrThrow(series.calendar_id);
  const siteName = series.site_id
    ? ((await getSiteNames([series.site_id])).get(series.site_id) ?? null)
    : null;
  const roomName = series.room_id
    ? ((await getRoomNames([series.room_id])).get(series.room_id) ?? null)
    : null;
  const teamsMap = await getSeriesTeamsMap([seriesId]);
  return serializeSeriesManagement(
    series,
    organization,
    siteName,
    roomName,
    teamsMap.get(seriesId) ?? [],
  );
}

/**
 * Updates the site/room and team assignments of an event series.
 *
 * Assignment semantics:
 * - No site and no room: the event has no location.
 * - Site only (reserveWholeSite false): the event is at the site, room TBD.
 * - Site only (reserveWholeSite true): the event reserves the whole site.
 * - Site and room: the event is in a specific room within the site. When a
 *   room is set, the site is derived from the room if not given explicitly.
 * @param seriesId - The series ID.
 * @param data - The site, room, reserveWholeSite and team IDs.
 * @returns The updated series with site/room and teams.
 */
export async function updateEventSeriesConfig(
  seriesId: number,
  data: {
    siteId?: string | null;
    roomId?: string | null;
    reserveWholeSite?: boolean;
    teamIds?: string[];
  },
): Promise<EventSeriesManagementResponse> {
  logger.trace('eventService.updateEventSeriesConfig');
  await getSeriesRowOrThrow(seriesId);

  // Validate the site.
  if (data.siteId !== undefined && data.siteId !== null) {
    const site = await db
      .selectFrom('sites')
      .select('id')
      .where('id', '=', data.siteId)
      .executeTakeFirst();
    if (!site) {
      throw notFound(`Site ${data.siteId} not found!`);
    }
  }

  // Validate the room and derive its site when a room is given.
  let resolvedSiteId = data.siteId ?? undefined;
  if (data.roomId !== undefined && data.roomId !== null) {
    const room = await db
      .selectFrom('rooms')
      .select(['id', 'site_id'])
      .where('id', '=', data.roomId)
      .executeTakeFirst();
    if (!room) {
      throw notFound(`Room ${data.roomId} not found!`);
    }
    // If no explicit site is given, derive it from the room.
    if (resolvedSiteId === undefined) {
      resolvedSiteId = room.site_id;
    }
  }

  // The writes run in a transaction; the read-only lookups (organization,
  // site/room names, team map) run after it on the main db instance. This
  // avoids using db inside the transaction callback, which deadlocks on
  // single-connection databases like PGlite.
  const updated = await db.transaction().execute(async tx => {
    if (
      data.siteId !== undefined ||
      data.roomId !== undefined ||
      data.reserveWholeSite !== undefined
    ) {
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (data.siteId !== undefined) updates.site_id = data.siteId;
      if (data.roomId !== undefined) updates.room_id = data.roomId;
      if (data.reserveWholeSite !== undefined) updates.reserve_whole_site = data.reserveWholeSite;
      // When a room is assigned without an explicit site, derive the site.
      if (
        data.siteId === undefined &&
        data.roomId !== undefined &&
        data.roomId !== null &&
        resolvedSiteId !== undefined
      ) {
        updates.site_id = resolvedSiteId;
      }
      // When the room is cleared, also clear reserve_whole_site.
      if (data.roomId === null) {
        updates.reserve_whole_site = false;
      }
      await tx.updateTable('event_series').set(updates).where('id', '=', seriesId).execute();
    }

    if (data.teamIds !== undefined) {
      if (data.teamIds.length > 0) {
        const teams = await tx
          .selectFrom('teams')
          .select('id')
          .where('id', 'in', data.teamIds)
          .execute();
        if (teams.length !== data.teamIds.length) {
          throw notFound('One or more teams not found!');
        }
      }
      await tx.deleteFrom('event_series_teams').where('event_series_id', '=', seriesId).execute();
      if (data.teamIds.length > 0) {
        await tx
          .insertInto('event_series_teams')
          .values(data.teamIds.map(teamId => ({ event_series_id: seriesId, team_id: teamId })))
          .execute();
      }
    }

    return tx
      .selectFrom('event_series')
      .selectAll()
      .where('id', '=', seriesId)
      .executeTakeFirstOrThrow();
  });

  const organization = await getCalendarOrganizationOrThrow(updated.calendar_id);
  const siteName = updated.site_id
    ? ((await getSiteNames([updated.site_id])).get(updated.site_id) ?? null)
    : null;
  const roomName = updated.room_id
    ? ((await getRoomNames([updated.room_id])).get(updated.room_id) ?? null)
    : null;
  const teamsMap = await getSeriesTeamsMap([seriesId]);
  return serializeSeriesManagement(
    updated,
    organization,
    siteName,
    roomName,
    teamsMap.get(seriesId) ?? [],
  );
}
