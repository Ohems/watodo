import { db } from '../database.js';
import type { EventComment, EventException, EventJob, EventSeries } from '../db/types.js';
import { badRequest, forbidden, isUniqueViolation, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type {
  EventCommentPush,
  EventCommentUpdate,
  EventJobPush,
  EventJobUpdate,
  EventSeriesPush,
  EventSeriesUpdate,
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
  seriesId: number;
  title: string;
  description: string | null;
  isAllDay: boolean;
  siteId: string | null;
  roomId: string | null;
  reserveWholeSite: boolean;
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

export interface EventJobAssignmentResponse {
  id: number;
  jobId: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface EventJobResponse {
  id: number;
  seriesId: number;
  occurrenceStart: string | null;
  title: string;
  description: string;
  assignments: EventJobAssignmentResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface EventCommentResponse {
  id: number;
  seriesId: number;
  occurrenceStart: string | null;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventOccurrenceDetailResponse {
  series: EventSeriesResponse;
  occurrence: EventOccurrenceResponse;
  jobs: EventJobResponse[];
  comments: EventCommentResponse[];
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

function toExceptionRule(exception: EventException): OccurrenceExceptionRule {
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

function serializeOccurrence(
  series: EventSeries,
  occurrence: ExpandedOccurrence,
): EventOccurrenceResponse {
  return {
    seriesId: series.id,
    title: series.title,
    description: series.description,
    isAllDay: series.is_all_day,
    siteId: series.site_id,
    roomId: series.room_id,
    reserveWholeSite: series.reserve_whole_site,
    occurrenceStart: occurrence.occurrenceStart.toISOString(),
    start: occurrence.start.toISOString(),
    end: occurrence.end.toISOString(),
    isRescheduled: occurrence.exception?.overrideStart != null,
    isCancelled: occurrence.exception?.isCancelled ?? false,
    exceptionId: occurrence.exception?.id ?? null,
  };
}

function serializeException(exception: EventException): EventExceptionResponse {
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

function serializeJob(job: EventJob): Omit<EventJobResponse, 'assignments'> {
  return {
    id: job.id,
    seriesId: job.event_series_id,
    occurrenceStart: job.occurrence_start?.toISOString() ?? null,
    title: job.title,
    description: job.description,
    createdAt: job.created_at.toISOString(),
    updatedAt: job.updated_at.toISOString(),
  };
}

function serializeComment(comment: EventCommentRow): EventCommentResponse {
  return {
    id: comment.id,
    seriesId: comment.event_series_id,
    occurrenceStart: comment.occurrence_start?.toISOString() ?? null,
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
    .selectFrom('event_exceptions')
    .selectAll()
    .where('event_series_id', 'in', seriesIds)
    .orderBy('occurrence_start', 'asc')
    .execute();
  for (const row of rows) {
    const list = bySeries.get(row.event_series_id) ?? [];
    list.push(toExceptionRule(row));
    bySeries.set(row.event_series_id, list);
  }
  return bySeries;
}

async function attachAssignments(jobs: EventJob[]): Promise<EventJobResponse[]> {
  if (jobs.length === 0) return [];
  const assignments = await db
    .selectFrom('event_job_assignments')
    .innerJoin('users', 'users.id', 'event_job_assignments.user_id')
    .select([
      'event_job_assignments.id',
      'event_job_assignments.event_job_id',
      'event_job_assignments.user_id',
      'event_job_assignments.created_at',
      'users.name as user_name',
    ])
    .where(
      'event_job_assignments.event_job_id',
      'in',
      jobs.map(job => job.id),
    )
    .orderBy('event_job_assignments.id', 'asc')
    .execute();

  return jobs.map(job => ({
    ...serializeJob(job),
    assignments: assignments
      .filter(assignment => assignment.event_job_id === job.id)
      .map(assignment => ({
        id: assignment.id,
        jobId: assignment.event_job_id,
        userId: assignment.user_id,
        userName: assignment.user_name,
        createdAt: assignment.created_at.toISOString(),
      })),
  }));
}

// --- Event series ---

export async function listEventSeries(calendarId?: string): Promise<EventSeriesResponse[]> {
  logger.trace('eventService.listEventSeries');
  let query = db.selectFrom('event_series').selectAll().orderBy('start', 'asc');
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
      await tx.deleteFrom('event_exceptions').where('event_series_id', '=', seriesId).execute();
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
 * is created and series-wide job slots and comments survive.
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
        .deleteFrom('event_exceptions')
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
      .deleteFrom('event_exceptions')
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

interface MyJobAssignments {
  /** Series with a series-wide job slot assigned to the user. */
  seriesWide: Set<number>;
  /** `${seriesId}:${occurrenceStartISO}` keys of occurrence-scoped job slots. */
  perOccurrence: Set<string>;
}

/**
 * Collects the job slots of the given series that are assigned to the user,
 * split into series-wide slots (applying to every occurrence) and
 * occurrence-scoped slots (keyed by the original occurrence start).
 */
async function fetchMyJobAssignments(
  seriesIds: number[],
  userId: string,
): Promise<MyJobAssignments> {
  const assignments: MyJobAssignments = { seriesWide: new Set(), perOccurrence: new Set() };
  if (seriesIds.length === 0) return assignments;
  const rows = await db
    .selectFrom('event_jobs')
    .innerJoin('event_job_assignments', 'event_job_assignments.event_job_id', 'event_jobs.id')
    .select(['event_jobs.event_series_id', 'event_jobs.occurrence_start'])
    .where('event_job_assignments.user_id', '=', userId)
    .where('event_jobs.event_series_id', 'in', seriesIds)
    .execute();
  for (const row of rows) {
    if (row.occurrence_start === null) {
      assignments.seriesWide.add(row.event_series_id);
    } else {
      assignments.perOccurrence.add(`${row.event_series_id}:${row.occurrence_start.toISOString()}`);
    }
  }
  return assignments;
}

/**
 * Lists the occurrences of all visible series within a time range, optionally
 * narrowed down by calendar, location, team and scope. The `mine` scope keeps
 * only occurrences the user is assigned to (via a series-wide or
 * occurrence-scoped job slot); the `team` scope keeps only series linked to a
 * team the user belongs to.
 * @param rangeStart - Start of the range (inclusive).
 * @param rangeEnd - End of the range (inclusive).
 * @param calendarId - Optional calendar to restrict the series to.
 * @param filter - Optional location, team and scope filters.
 * @param userId - The current user, required for the `mine` and `team` scopes.
 * @returns The occurrences in the range, sorted by start.
 */
export async function getOccurrences(
  rangeStart: Date,
  rangeEnd: Date,
  calendarId?: string,
  filter?: OccurrenceFilter,
  userId?: string,
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
  const myAssignments =
    filter?.scope === 'mine' && userId
      ? await fetchMyJobAssignments(
          series.map(row => row.id),
          userId,
        )
      : null;

  const occurrences: EventOccurrenceResponse[] = [];
  for (const row of series) {
    const exceptions = exceptionsBySeries.get(row.id) ?? [];
    for (const occurrence of expandOccurrences(toRule(row), exceptions, rangeStart, rangeEnd)) {
      if (myAssignments) {
        const key = `${row.id}:${occurrence.occurrenceStart.toISOString()}`;
        if (!myAssignments.seriesWide.has(row.id) && !myAssignments.perOccurrence.has(key)) {
          continue;
        }
      }
      occurrences.push(serializeOccurrence(row, occurrence));
    }
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
  const exceptions = (await fetchExceptionRules([seriesId])).get(seriesId) ?? [];
  return expandOccurrences(toRule(series), exceptions, rangeStart, rangeEnd).map(occurrence =>
    serializeOccurrence(series, occurrence),
  );
}

export async function getOccurrenceDetail(
  seriesId: number,
  occurrenceStart: Date,
): Promise<EventOccurrenceDetailResponse> {
  logger.trace('eventService.getOccurrenceDetail');

  const series = await getSeriesRowOrThrow(seriesId);
  assertOccurrence(series, occurrenceStart);

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

  const jobs = await listEventJobs(seriesId, occurrenceStart);
  const comments = await listEventComments(seriesId, occurrenceStart);

  return {
    series: serializeSeries(series),
    occurrence: {
      seriesId: series.id,
      title: series.title,
      description: series.description,
      isAllDay: series.is_all_day,
      siteId: series.site_id,
      roomId: series.room_id,
      reserveWholeSite: series.reserve_whole_site,
      occurrenceStart: occurrenceStart.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      isRescheduled: exception?.overrideStart != null,
      isCancelled: exception?.isCancelled ?? false,
      exceptionId: exception?.id ?? null,
    },
    jobs,
    comments,
  };
}

// --- Occurrence exceptions (cancel / reschedule) ---

export async function listExceptions(seriesId: number): Promise<EventExceptionResponse[]> {
  logger.trace('eventService.listExceptions');
  await getSeriesRowOrThrow(seriesId);
  const rows = await db
    .selectFrom('event_exceptions')
    .selectAll()
    .where('event_series_id', '=', seriesId)
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

  const exception = await db
    .insertInto('event_exceptions')
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

  const start = new Date(data.start);
  const end = data.end
    ? new Date(data.end)
    : new Date(start.getTime() + series.duration_minutes * 60 * 1000);
  if (end.getTime() <= start.getTime()) {
    throw badRequest('Rescheduled end must be after the rescheduled start!');
  }

  const exception = await db
    .insertInto('event_exceptions')
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

  const result = await db
    .deleteFrom('event_exceptions')
    .where('event_series_id', '=', seriesId)
    .where('occurrence_start', '=', occurrenceStart)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(
      `No exception for occurrence ${occurrenceStart.toISOString()} in event series ${seriesId}!`,
    );
  }
}

// --- Job slots ---

export async function listEventJobs(
  seriesId: number,
  occurrenceStart?: Date,
): Promise<EventJobResponse[]> {
  logger.trace('eventService.listEventJobs');
  await getSeriesRowOrThrow(seriesId);

  let query = db.selectFrom('event_jobs').selectAll().where('event_series_id', '=', seriesId);
  if (occurrenceStart) {
    query = query.where(eb =>
      eb.or([eb('occurrence_start', 'is', null), eb('occurrence_start', '=', occurrenceStart)]),
    );
  }
  const jobs = await query.orderBy('id', 'asc').execute();
  return attachAssignments(jobs);
}

export async function createEventJob(
  seriesId: number,
  data: EventJobPush,
): Promise<EventJobResponse> {
  logger.trace('eventService.createEventJob');
  const series = await getSeriesRowOrThrow(seriesId);
  const occurrenceStart = await resolveOccurrenceStart(series, data.occurrenceStart);

  const job = await db
    .insertInto('event_jobs')
    .values({
      event_series_id: seriesId,
      occurrence_start: occurrenceStart,
      title: data.title,
      description: data.description ?? '',
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return (await attachAssignments([job]))[0];
}

export async function updateEventJob(
  seriesId: number,
  jobId: number,
  data: EventJobUpdate,
): Promise<EventJobResponse> {
  logger.trace('eventService.updateEventJob');
  const series = await getSeriesRowOrThrow(seriesId);

  const job = await db
    .selectFrom('event_jobs')
    .selectAll()
    .where('id', '=', jobId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (!job) {
    throw notFound(`Job slot ${jobId} not found in event series ${seriesId}!`);
  }

  const update: Record<string, unknown> = { updated_at: new Date() };
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.occurrenceStart !== undefined) {
    update.occurrence_start =
      data.occurrenceStart === null
        ? null
        : await resolveOccurrenceStart(series, data.occurrenceStart);
  }

  const updated = await db
    .updateTable('event_jobs')
    .set(update)
    .where('id', '=', jobId)
    .returningAll()
    .executeTakeFirstOrThrow();

  return (await attachAssignments([updated]))[0];
}

export async function deleteEventJob(seriesId: number, jobId: number): Promise<void> {
  logger.trace('eventService.deleteEventJob');
  await getSeriesRowOrThrow(seriesId);

  const result = await db
    .deleteFrom('event_jobs')
    .where('id', '=', jobId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (result.numDeletedRows === 0n) {
    throw notFound(`Job slot ${jobId} not found in event series ${seriesId}!`);
  }
}

export async function assignUserToJob(
  seriesId: number,
  jobId: number,
  userId: string,
): Promise<EventJobAssignmentResponse> {
  logger.trace('eventService.assignUserToJob');
  await getSeriesRowOrThrow(seriesId);

  const job = await db
    .selectFrom('event_jobs')
    .select('id')
    .where('id', '=', jobId)
    .where('event_series_id', '=', seriesId)
    .executeTakeFirst();
  if (!job) {
    throw notFound(`Job slot ${jobId} not found in event series ${seriesId}!`);
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
      .insertInto('event_job_assignments')
      .values({ event_job_id: jobId, user_id: userId })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: assignment.id,
      jobId: assignment.event_job_id,
      userId: assignment.user_id,
      userName: user.name,
      createdAt: assignment.created_at.toISOString(),
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw badRequest('User is already assigned to this job slot!');
    }
    throw error;
  }
}

export async function unassignUserFromJob(
  seriesId: number,
  jobId: number,
  assignmentId: number,
): Promise<void> {
  logger.trace('eventService.unassignUserFromJob');
  await getSeriesRowOrThrow(seriesId);

  const assignment = await db
    .selectFrom('event_job_assignments')
    .innerJoin('event_jobs', 'event_jobs.id', 'event_job_assignments.event_job_id')
    .select([
      'event_job_assignments.id',
      'event_job_assignments.event_job_id',
      'event_jobs.event_series_id',
    ])
    .where('event_job_assignments.id', '=', assignmentId)
    .executeTakeFirst();
  if (!assignment || assignment.event_job_id !== jobId || assignment.event_series_id !== seriesId) {
    throw notFound(`Assignment ${assignmentId} not found in event series ${seriesId}!`);
  }

  await db.deleteFrom('event_job_assignments').where('id', '=', assignmentId).execute();
}

// --- Comments ---

const commentSelect = [
  'event_comments.id',
  'event_comments.event_series_id',
  'event_comments.occurrence_start',
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
    query = query.where(eb =>
      eb.or([
        eb('event_comments.occurrence_start', 'is', null),
        eb('event_comments.occurrence_start', '=', occurrenceStart),
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
      occurrence_start: occurrenceStart,
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
  siteName: string | null,
  roomName: string | null,
  teams: EventSeriesTeamResponse[],
): EventSeriesManagementResponse {
  return {
    ...serializeSeries(series),
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
}): Promise<PaginatedEventSeries> {
  logger.trace('eventService.listEventSeriesPaginated');
  const page = query.page ?? 0;
  const limit = query.limit ?? 50;
  const search = query.search?.trim();

  let baseQuery = db.selectFrom('event_series').selectAll('event_series');
  let countQuery = db.selectFrom('event_series').select(db.fn.countAll().as('count'));

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

  const items = rows.map(row =>
    serializeSeriesManagement(
      row as EventSeries,
      row.site_id ? (siteNames.get(row.site_id) ?? null) : null,
      row.room_id ? (roomNames.get(row.room_id) ?? null) : null,
      teamsMap.get(row.id) ?? [],
    ),
  );

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
  const siteName = series.site_id
    ? ((await getSiteNames([series.site_id])).get(series.site_id) ?? null)
    : null;
  const roomName = series.room_id
    ? ((await getRoomNames([series.room_id])).get(series.room_id) ?? null)
    : null;
  const teamsMap = await getSeriesTeamsMap([seriesId]);
  return serializeSeriesManagement(series, siteName, roomName, teamsMap.get(seriesId) ?? []);
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

  return db.transaction().execute(async tx => {
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

    const updated = await tx
      .selectFrom('event_series')
      .selectAll()
      .where('id', '=', seriesId)
      .executeTakeFirstOrThrow();

    const siteName = updated.site_id
      ? ((await getSiteNames([updated.site_id])).get(updated.site_id) ?? null)
      : null;
    const roomName = updated.room_id
      ? ((await getRoomNames([updated.room_id])).get(updated.room_id) ?? null)
      : null;
    const teamsMap = await getSeriesTeamsMap([seriesId]);
    return serializeSeriesManagement(updated, siteName, roomName, teamsMap.get(seriesId) ?? []);
  });
}
