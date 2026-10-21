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

// Resolves the timezone for a series: the explicitly given one, or the
// default timezone of the organization that owns the calendar.
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

// Splits a series at the given occurrence ("edit this and all following"):
// the edited occurrence begins a new, independent series with the given
// parameters (fields not provided are inherited from the original series and
// the start defaults to the split occurrence), the original series is
// truncated so it ends just before the split occurrence, and all exceptions
// from the split occurrence onwards are reset. Splitting at the very first
// occurrence updates the series in place instead, so no empty leftover series
// is created and series-wide job slots and comments survive.
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

export async function getOccurrences(
  rangeStart: Date,
  rangeEnd: Date,
  calendarId?: string,
): Promise<EventOccurrenceResponse[]> {
  logger.trace('eventService.getOccurrences');
  validateRange(rangeStart, rangeEnd);

  let query = db.selectFrom('event_series').selectAll().where('is_visible', '=', true);
  if (calendarId) {
    query = query.where('calendar_id', '=', calendarId);
  }
  const series = await query.orderBy('start', 'asc').execute();
  const exceptionsBySeries = await fetchExceptionRules(series.map(row => row.id));

  const occurrences: EventOccurrenceResponse[] = [];
  for (const row of series) {
    const exceptions = exceptionsBySeries.get(row.id) ?? [];
    for (const occurrence of expandOccurrences(toRule(row), exceptions, rangeStart, rangeEnd)) {
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
