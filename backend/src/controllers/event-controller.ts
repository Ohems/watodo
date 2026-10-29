import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../database.js';
import { getAuth } from '../middleware/auth.js';
import {
  eventCommentPushSchema,
  eventCommentsQuerySchema,
  eventCommentUpdateSchema,
  eventSeriesPushSchema,
  eventSeriesQuerySchema,
  eventSeriesUpdateSchema,
  eventWorkRoleAssignmentSchema,
  eventWorkRolePushSchema,
  eventWorkRolesQuerySchema,
  eventWorkRoleUpdateSchema,
  occurrenceRangeQuerySchema,
  occurrenceStartSchema,
  rescheduleOccurrenceSchema,
} from '../schemas/index.js';
import {
  assignUserToWorkRole,
  cancelOccurrence,
  createEventComment,
  createEventSeries,
  createEventWorkRole,
  deleteEventComment,
  deleteEventSeries,
  deleteEventWorkRole,
  deleteException,
  getEventSeries,
  getOccurrenceDetail,
  getOccurrenceDetailByRef,
  getOccurrences,
  getSeriesOccurrences,
  importParentSlots,
  listEventComments,
  listEventSeries,
  listEventWorkRoles,
  listExceptions,
  rescheduleOccurrence,
  resolveOccurrenceRef,
  splitEventSeries,
  unassignUserFromWorkRole,
  updateEventComment,
  updateEventSeries,
  updateEventWorkRole,
} from '../services/event-service.js';

interface SeriesParams {
  Params: { seriesId: string };
}

interface OccurrenceParams {
  Params: { seriesId: string; occurrenceStart: string };
}

interface WorkRoleParams {
  Params: { seriesId: string; workRoleId: string };
}

interface WorkRoleAssignmentParams {
  Params: { seriesId: string; workRoleId: string; assignmentId: string };
}

interface CommentParams {
  Params: { seriesId: string; commentId: string };
}

interface OccurrenceRefParams {
  Params: { occurrenceRef: string };
}

function parseId(value: string, name: string): number {
  const id = Number.parseInt(value, 10);
  if (Number.isNaN(id)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
  return id;
}

function parseOccurrenceStart(value: string): Date {
  return new Date(occurrenceStartSchema.parse(value));
}

function requireAuthUser(request: FastifyRequest): { id: string } {
  const auth = getAuth(request);
  if (!auth) {
    throw new Error('Not authenticated!');
  }
  return auth.user;
}

export async function listEventSeriesHandler(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const query = eventSeriesQuerySchema.parse(request.query);
  const series = await listEventSeries(query.organizationId, query.calendarId);
  return reply.status(200).send(series);
}

export async function createEventSeriesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = eventSeriesPushSchema.parse(request.body);
  const series = await createEventSeries(data);
  return reply.status(200).send(series);
}

export async function getEventSeriesHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const series = await getEventSeries(parseId(request.params.seriesId, 'seriesId'));
  return reply.status(200).send(series);
}

export async function updateEventSeriesHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventSeriesUpdateSchema.parse(request.body);
  const series = await updateEventSeries(parseId(request.params.seriesId, 'seriesId'), data);
  return reply.status(200).send(series);
}

export async function deleteEventSeriesHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  await deleteEventSeries(parseId(request.params.seriesId, 'seriesId'));
  return reply.status(200).send({ success: true });
}

export async function getOccurrencesHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const query = occurrenceRangeQuerySchema.parse(request.query);
  const user = requireAuthUser(request);
  const occurrences = await getOccurrences(
    new Date(query.start),
    new Date(query.end),
    query.calendarId,
    query,
    user.id,
    query.organizationId,
  );
  return reply.status(200).send(occurrences);
}

export async function getSeriesOccurrencesHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const query = occurrenceRangeQuerySchema.parse(request.query);
  const occurrences = await getSeriesOccurrences(
    parseId(request.params.seriesId, 'seriesId'),
    new Date(query.start),
    new Date(query.end),
  );
  return reply.status(200).send(occurrences);
}

export async function getOccurrenceDetailHandler(
  request: FastifyRequest<OccurrenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const detail = await getOccurrenceDetail(
    parseId(request.params.seriesId, 'seriesId'),
    parseOccurrenceStart(request.params.occurrenceStart),
  );
  return reply.status(200).send(detail);
}

/** Gets a single occurrence detail by its reference (stable ID or tmp key). */
export async function getOccurrenceDetailByRefHandler(
  request: FastifyRequest<OccurrenceRefParams>,
  reply: FastifyReply,
): Promise<void> {
  const detail = await getOccurrenceDetailByRef(request.params.occurrenceRef);
  return reply.status(200).send(detail);
}

export async function cancelOccurrenceHandler(
  request: FastifyRequest<OccurrenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const exception = await cancelOccurrence(
    parseId(request.params.seriesId, 'seriesId'),
    parseOccurrenceStart(request.params.occurrenceStart),
  );
  return reply.status(200).send(exception);
}

export async function rescheduleOccurrenceHandler(
  request: FastifyRequest<OccurrenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = rescheduleOccurrenceSchema.parse(request.body);
  const exception = await rescheduleOccurrence(
    parseId(request.params.seriesId, 'seriesId'),
    parseOccurrenceStart(request.params.occurrenceStart),
    data,
  );
  return reply.status(200).send(exception);
}

export async function deleteExceptionHandler(
  request: FastifyRequest<OccurrenceParams>,
  reply: FastifyReply,
): Promise<void> {
  await deleteException(
    parseId(request.params.seriesId, 'seriesId'),
    parseOccurrenceStart(request.params.occurrenceStart),
  );
  return reply.status(200).send({ success: true });
}

/**
 * "Edit this and all following": the occurrence begins a new series with the
 * given parameters, the original series is truncated before it, and all
 * exceptions from the occurrence onwards are reset.
 */
export async function splitEventSeriesHandler(
  request: FastifyRequest<OccurrenceParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventSeriesUpdateSchema.parse(request.body);
  const series = await splitEventSeries(
    parseId(request.params.seriesId, 'seriesId'),
    parseOccurrenceStart(request.params.occurrenceStart),
    data,
  );
  return reply.status(200).send(series);
}

export async function listExceptionsHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const exceptions = await listExceptions(parseId(request.params.seriesId, 'seriesId'));
  return reply.status(200).send(exceptions);
}

export async function listEventWorkRolesHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const query = eventWorkRolesQuerySchema.parse(request.query);
  const jobs = await listEventWorkRoles(parseId(request.params.seriesId, 'seriesId'), {
    occurrenceStart: query.occurrenceStart ? new Date(query.occurrenceStart) : undefined,
  });
  return reply.status(200).send(jobs);
}

export async function createEventWorkRoleHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRolePushSchema.parse(request.body);
  const job = await createEventWorkRole(parseId(request.params.seriesId, 'seriesId'), data);
  return reply.status(200).send(job);
}

export async function updateEventWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRoleUpdateSchema.parse(request.body);
  const job = await updateEventWorkRole(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
    data,
  );
  return reply.status(200).send(job);
}

export async function deleteEventWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  await deleteEventWorkRole(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
  );
  return reply.status(200).send({ success: true });
}

export async function assignUserToWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRoleAssignmentSchema.parse(request.body);
  const assignment = await assignUserToWorkRole(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
    data.userId,
  );
  return reply.status(200).send(assignment);
}

export async function unassignUserFromWorkRoleHandler(
  request: FastifyRequest<WorkRoleAssignmentParams>,
  reply: FastifyReply,
): Promise<void> {
  await unassignUserFromWorkRole(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
    parseId(request.params.assignmentId, 'assignmentId'),
  );
  return reply.status(200).send({ success: true });
}

export async function listEventCommentsHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const query = eventCommentsQuerySchema.parse(request.query);
  const comments = await listEventComments(
    parseId(request.params.seriesId, 'seriesId'),
    query.occurrenceStart ? new Date(query.occurrenceStart) : undefined,
  );
  return reply.status(200).send(comments);
}

export async function createEventCommentHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventCommentPushSchema.parse(request.body);
  const user = requireAuthUser(request);
  const comment = await createEventComment(
    parseId(request.params.seriesId, 'seriesId'),
    user.id,
    data,
  );
  return reply.status(200).send(comment);
}

export async function updateEventCommentHandler(
  request: FastifyRequest<CommentParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventCommentUpdateSchema.parse(request.body);
  const user = requireAuthUser(request);
  const comment = await updateEventComment(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.commentId, 'commentId'),
    user.id,
    data,
  );
  return reply.status(200).send(comment);
}

export async function deleteEventCommentHandler(
  request: FastifyRequest<CommentParams>,
  reply: FastifyReply,
): Promise<void> {
  const user = requireAuthUser(request);
  await deleteEventComment(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.commentId, 'commentId'),
    user.id,
  );
  return reply.status(200).send({ success: true });
}

// --- Management endpoints ---

import { eventSeriesConfigSchema, eventSeriesListQuerySchema } from '../schemas/index.js';
import {
  getEventSeriesManagement,
  listEventSeriesPaginated,
  updateEventSeriesConfig,
} from '../services/event-service.js';

export async function listEventSeriesPaginatedHandler(
  request: FastifyRequest<{ Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const query = eventSeriesListQuerySchema.parse(request.query);
  const result = await listEventSeriesPaginated(query);
  return reply.status(200).send(result);
}

export async function getEventSeriesManagementHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const seriesId = parseId(request.params.seriesId, 'seriesId');
  const series = await getEventSeriesManagement(seriesId);
  return reply.status(200).send(series);
}

export async function updateEventSeriesConfigHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const seriesId = parseId(request.params.seriesId, 'seriesId');
  const data = eventSeriesConfigSchema.parse(request.body);
  const series = await updateEventSeriesConfig(seriesId, data);
  return reply.status(200).send(series);
}

// --- Role requirements ---

// --- Occurrence-level work role slots ---

/**
 * Resolves an occurrence ref to (seriesId, occurrenceId, occurrenceStart) for
 * write operations. The occurrence must already be materialized (numeric ID).
 */
async function resolveOccurrenceForWrite(
  ref: string,
): Promise<{ seriesId: number; occurrenceId: number; occurrenceStart: Date }> {
  const resolved = await resolveOccurrenceRef(ref);
  if (!/^\d+$/.test(ref)) {
    throw new Error('Occurrence must be materialized (numeric ID) for this operation!');
  }
  const row = await db
    .selectFrom('event_occurrences')
    .select(['id', 'occurrence_start'])
    .where('event_series_id', '=', resolved.seriesId)
    .where('occurrence_start', '=', resolved.occurrenceStart)
    .executeTakeFirstOrThrow();
  return {
    seriesId: resolved.seriesId,
    occurrenceId: row.id,
    occurrenceStart: row.occurrence_start,
  };
}

export async function importParentSlotsHandler(
  request: FastifyRequest<OccurrenceRefParams>,
  reply: FastifyReply,
): Promise<void> {
  const { seriesId, occurrenceId, occurrenceStart } = await resolveOccurrenceForWrite(
    request.params.occurrenceRef,
  );
  const imported = await importParentSlots(seriesId, occurrenceId, occurrenceStart);
  return reply.status(200).send(imported);
}
