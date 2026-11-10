import type { FastifyReply, FastifyRequest } from 'fastify';
import { db } from '../database.js';
import { getAuth } from '../middleware/auth.js';
import {
  assignmentCandidatesQuerySchema,
  eventCommentPushSchema,
  eventCommentsQuerySchema,
  eventCommentUpdateSchema,
  eventInfoSlotPushSchema,
  eventInfoSlotsQuerySchema,
  eventInfoSlotUpdateSchema,
  eventInfoSlotValueSchema,
  eventSeriesPushSchema,
  eventSeriesQuerySchema,
  eventSeriesUpdateSchema,
  eventWorkRoleAssignmentSchema,
  eventWorkRolePushSchema,
  eventWorkRolesQuerySchema,
  eventWorkRoleUpdateSchema,
  occurrenceRangeQuerySchema,
  occurrenceStartSchema,
  organizationUserParamsSchema,
  rescheduleOccurrenceSchema,
  userEventAssignmentsQuerySchema,
} from '../schemas/index.js';
import {
  assignUserToOccurrenceWorkRole,
  assignUserToWorkRole,
  cancelOccurrence,
  createEventComment,
  createEventInfoSlot,
  createEventSeries,
  createEventWorkRole,
  createOccurrenceComment,
  createOccurrenceWorkRole,
  deleteEventComment,
  deleteEventInfoSlot,
  deleteEventSeries,
  deleteEventWorkRole,
  deleteException,
  deleteOccurrenceComment,
  deleteOccurrenceWorkRole,
  getAssignmentCandidates,
  getEventSeries,
  getOccurrenceDetail,
  getOccurrenceDetailByRef,
  getOccurrences,
  getSeriesOccurrences,
  getUserEventAssignments,
  importParentInfoSlots,
  importParentSlots,
  listEventComments,
  listEventInfoSlots,
  listEventSeries,
  listEventWorkRoles,
  listExceptions,
  listOccurrenceComments,
  listOccurrenceInfoSlots,
  listOccurrenceWorkRoles,
  materializeOccurrenceByRef,
  rescheduleOccurrence,
  resolveOccurrenceRef,
  splitEventSeries,
  unassignUserFromOccurrenceWorkRole,
  unassignUserFromWorkRole,
  updateEventComment,
  updateEventInfoSlot,
  updateEventSeries,
  updateEventWorkRole,
  updateOccurrenceComment,
  updateOccurrenceInfoSlotValue,
  updateOccurrenceWorkRole,
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

interface InfoSlotParams {
  Params: { seriesId: string; infoSlotId: string };
}

interface OccurrenceInfoSlotParams {
  Params: { eventOccurrenceId: string; infoSlotId: string };
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
  const user = requireAuthUser(request);
  const occurrences = await getSeriesOccurrences(
    parseId(request.params.seriesId, 'seriesId'),
    new Date(query.start),
    new Date(query.end),
    user.id,
  );
  return reply.status(200).send(occurrences);
}

/**
 * Lists the event occurrences a specific organization user is assigned to
 * (with the roles/slots), within an optional date span. The span defaults to
 * one month back and forward from the current date.
 */
export async function getUserEventAssignmentsHandler(
  request: FastifyRequest<{ Params: { organizationId: string; userId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const { organizationId, userId } = organizationUserParamsSchema.parse(request.params);
  const query = userEventAssignmentsQuerySchema.parse(request.query);
  const now = new Date();
  const rangeStart = query.start
    ? new Date(query.start)
    : new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const rangeEnd = query.end
    ? new Date(query.end)
    : new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const result = await getUserEventAssignments(
    organizationId,
    userId,
    rangeStart,
    rangeEnd,
    query.page ?? 0,
    query.limit ?? 10,
  );
  return reply.status(200).send(result);
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
  const slots = await listEventWorkRoles(parseId(request.params.seriesId, 'seriesId'), {
    occurrenceStart: query.occurrenceStart ? new Date(query.occurrenceStart) : undefined,
  });
  return reply.status(200).send(slots);
}

export async function createEventWorkRoleHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRolePushSchema.parse(request.body);
  const slot = await createEventWorkRole(parseId(request.params.seriesId, 'seriesId'), data);
  return reply.status(200).send(slot);
}

export async function updateEventWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRoleUpdateSchema.parse(request.body);
  const slot = await updateEventWorkRole(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
    data,
  );
  return reply.status(200).send(slot);
}

export async function deleteEventWorkRoleHandler(
  request: FastifyRequest<WorkRoleParams & { Querystring: { occurrenceRef?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  await deleteEventWorkRole(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
    request.query.occurrenceRef,
  );
  return reply.status(200).send({ success: true });
}

// --- Event info slots ---

export async function listEventInfoSlotsHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const query = eventInfoSlotsQuerySchema.parse(request.query);
  const slots = await listEventInfoSlots(parseId(request.params.seriesId, 'seriesId'), {
    occurrenceStart: query.occurrenceStart ? new Date(query.occurrenceStart) : undefined,
  });
  return reply.status(200).send(slots);
}

export async function createEventInfoSlotHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventInfoSlotPushSchema.parse(request.body);
  const slot = await createEventInfoSlot(parseId(request.params.seriesId, 'seriesId'), data);
  return reply.status(200).send(slot);
}

export async function updateEventInfoSlotHandler(
  request: FastifyRequest<InfoSlotParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventInfoSlotUpdateSchema.parse(request.body);
  const slot = await updateEventInfoSlot(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.infoSlotId, 'infoSlotId'),
    data,
  );
  return reply.status(200).send(slot);
}

export async function deleteEventInfoSlotHandler(
  request: FastifyRequest<InfoSlotParams>,
  reply: FastifyReply,
): Promise<void> {
  await deleteEventInfoSlot(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.infoSlotId, 'infoSlotId'),
  );
  return reply.status(200).send({ success: true });
}

export async function listOccurrenceInfoSlotsHandler(
  request: FastifyRequest<OccurrenceIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const slots = await listOccurrenceInfoSlots(parseOccurrenceId(request.params.eventOccurrenceId));
  return reply.status(200).send(slots);
}

/** Sets the filled value of an occurrence's info slot; only the value may change. */
export async function updateOccurrenceInfoSlotHandler(
  request: FastifyRequest<OccurrenceInfoSlotParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventInfoSlotValueSchema.parse(request.body);
  const slot = await updateOccurrenceInfoSlotValue(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.infoSlotId, 'infoSlotId'),
    data.value,
  );
  return reply.status(200).send(slot);
}

/** Imports parent (series-level) info slots into a materialized occurrence. */
export async function importParentInfoSlotsHandler(
  request: FastifyRequest<OccurrenceRefParams>,
  reply: FastifyReply,
): Promise<void> {
  const { seriesId, occurrenceId } = await resolveOccurrenceForWrite(request.params.occurrenceRef);
  const imported = await importParentInfoSlots(seriesId, occurrenceId);
  return reply.status(200).send(imported);
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

/**
 * Lists the users as assignment candidates for a work role slot, with the
 * declared-role/qualification/certification flags computed against the slot's
 * work role (and absence flags when start/end are given).
 */
export async function getAssignmentCandidatesHandler(
  request: FastifyRequest<WorkRoleParams & { Querystring: unknown }>,
  reply: FastifyReply,
): Promise<void> {
  const query = assignmentCandidatesQuerySchema.parse(request.query ?? {});
  const candidates = await getAssignmentCandidates(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.workRoleId, 'workRoleId'),
    query,
  );
  return reply.status(200).send(candidates);
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

// --- Occurrence-scoped endpoints (occurrence page) ---
// These require a numeric eventOccurrenceId (the occurrence must be
// materialized first via POST /materialize). Only occurrence-level rows are
// modified, never the parent series slots/comments.

interface OccurrenceIdParams {
  Params: { eventOccurrenceId: string };
}

interface OccurrenceWorkRoleParams {
  Params: { eventOccurrenceId: string; workRoleId: string };
}

interface OccurrenceAssignmentParams {
  Params: { eventOccurrenceId: string; workRoleId: string; assignmentId: string };
}

interface OccurrenceCommentParams {
  Params: { eventOccurrenceId: string; commentId: string };
}

/** Parses a numeric occurrence ID; rejects tmp refs. */
function parseOccurrenceId(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('A numeric eventOccurrenceId is required; materialize the occurrence first.');
  }
  return Number.parseInt(value, 10);
}

/** Materializes a tmp occurrence ref and returns its stable numeric ID plus booking conflicts. */
export async function materializeOccurrenceHandler(
  request: FastifyRequest<OccurrenceRefParams>,
  reply: FastifyReply,
): Promise<void> {
  const result = await materializeOccurrenceByRef(request.params.occurrenceRef);
  return reply.status(200).send(result);
}

export async function listOccurrenceWorkRolesHandler(
  request: FastifyRequest<OccurrenceIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const slots = await listOccurrenceWorkRoles(parseOccurrenceId(request.params.eventOccurrenceId));
  return reply.status(200).send(slots);
}

export async function createOccurrenceWorkRoleHandler(
  request: FastifyRequest<OccurrenceIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRolePushSchema.parse(request.body);
  const slot = await createOccurrenceWorkRole(
    parseOccurrenceId(request.params.eventOccurrenceId),
    data,
  );
  return reply.status(200).send(slot);
}

export async function updateOccurrenceWorkRoleHandler(
  request: FastifyRequest<OccurrenceWorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRoleUpdateSchema.parse(request.body);
  const slot = await updateOccurrenceWorkRole(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.workRoleId, 'workRoleId'),
    data,
  );
  return reply.status(200).send(slot);
}

export async function deleteOccurrenceWorkRoleHandler(
  request: FastifyRequest<OccurrenceWorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  await deleteOccurrenceWorkRole(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.workRoleId, 'workRoleId'),
  );
  return reply.status(200).send({ success: true });
}

export async function assignUserToOccurrenceWorkRoleHandler(
  request: FastifyRequest<OccurrenceWorkRoleParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventWorkRoleAssignmentSchema.parse(request.body);
  const assignment = await assignUserToOccurrenceWorkRole(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.workRoleId, 'workRoleId'),
    data.userId,
  );
  return reply.status(200).send(assignment);
}

export async function unassignUserFromOccurrenceWorkRoleHandler(
  request: FastifyRequest<OccurrenceAssignmentParams>,
  reply: FastifyReply,
): Promise<void> {
  await unassignUserFromOccurrenceWorkRole(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.workRoleId, 'workRoleId'),
    parseId(request.params.assignmentId, 'assignmentId'),
  );
  return reply.status(200).send({ success: true });
}

export async function listOccurrenceCommentsHandler(
  request: FastifyRequest<OccurrenceIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const comments = await listOccurrenceComments(
    parseOccurrenceId(request.params.eventOccurrenceId),
  );
  return reply.status(200).send(comments);
}

export async function createOccurrenceCommentHandler(
  request: FastifyRequest<OccurrenceIdParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventCommentPushSchema.parse(request.body);
  const user = requireAuthUser(request);
  const comment = await createOccurrenceComment(
    parseOccurrenceId(request.params.eventOccurrenceId),
    user.id,
    data,
  );
  return reply.status(200).send(comment);
}

export async function updateOccurrenceCommentHandler(
  request: FastifyRequest<OccurrenceCommentParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventCommentUpdateSchema.parse(request.body);
  const user = requireAuthUser(request);
  const comment = await updateOccurrenceComment(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.commentId, 'commentId'),
    user.id,
    data,
  );
  return reply.status(200).send(comment);
}

export async function deleteOccurrenceCommentHandler(
  request: FastifyRequest<OccurrenceCommentParams>,
  reply: FastifyReply,
): Promise<void> {
  const user = requireAuthUser(request);
  await deleteOccurrenceComment(
    parseOccurrenceId(request.params.eventOccurrenceId),
    parseId(request.params.commentId, 'commentId'),
    user.id,
  );
  return reply.status(200).send({ success: true });
}
