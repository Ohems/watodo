import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../middleware/auth.js';
import {
  eventCommentPushSchema,
  eventCommentsQuerySchema,
  eventCommentUpdateSchema,
  eventJobAssignmentSchema,
  eventJobPushSchema,
  eventJobsQuerySchema,
  eventJobUpdateSchema,
  eventSeriesPushSchema,
  eventSeriesUpdateSchema,
  occurrenceRangeQuerySchema,
  occurrenceStartSchema,
  rescheduleOccurrenceSchema,
} from '../schemas/index.js';
import {
  assignUserToJob,
  cancelOccurrence,
  createEventComment,
  createEventJob,
  createEventSeries,
  deleteEventComment,
  deleteEventJob,
  deleteEventSeries,
  deleteException,
  getEventSeries,
  getOccurrenceDetail,
  getOccurrences,
  getSeriesOccurrences,
  listEventComments,
  listEventJobs,
  listEventSeries,
  listExceptions,
  rescheduleOccurrence,
  splitEventSeries,
  unassignUserFromJob,
  updateEventComment,
  updateEventJob,
  updateEventSeries,
} from '../services/event-service.js';

interface SeriesParams {
  Params: { seriesId: string };
}

interface OccurrenceParams {
  Params: { seriesId: string; occurrenceStart: string };
}

interface JobParams {
  Params: { seriesId: string; jobId: string };
}

interface JobAssignmentParams {
  Params: { seriesId: string; jobId: string; assignmentId: string };
}

interface CommentParams {
  Params: { seriesId: string; commentId: string };
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
  request: FastifyRequest<{ Querystring: { calendarId?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const calendarId = request.query.calendarId;
  const series = await listEventSeries(calendarId);
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

export async function listEventJobsHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const query = eventJobsQuerySchema.parse(request.query);
  const jobs = await listEventJobs(
    parseId(request.params.seriesId, 'seriesId'),
    query.occurrenceStart ? new Date(query.occurrenceStart) : undefined,
  );
  return reply.status(200).send(jobs);
}

export async function createEventJobHandler(
  request: FastifyRequest<SeriesParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventJobPushSchema.parse(request.body);
  const job = await createEventJob(parseId(request.params.seriesId, 'seriesId'), data);
  return reply.status(200).send(job);
}

export async function updateEventJobHandler(
  request: FastifyRequest<JobParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventJobUpdateSchema.parse(request.body);
  const job = await updateEventJob(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.jobId, 'jobId'),
    data,
  );
  return reply.status(200).send(job);
}

export async function deleteEventJobHandler(
  request: FastifyRequest<JobParams>,
  reply: FastifyReply,
): Promise<void> {
  await deleteEventJob(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.jobId, 'jobId'),
  );
  return reply.status(200).send({ success: true });
}

export async function assignUserToJobHandler(
  request: FastifyRequest<JobParams>,
  reply: FastifyReply,
): Promise<void> {
  const data = eventJobAssignmentSchema.parse(request.body);
  const assignment = await assignUserToJob(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.jobId, 'jobId'),
    data.userId,
  );
  return reply.status(200).send(assignment);
}

export async function unassignUserFromJobHandler(
  request: FastifyRequest<JobAssignmentParams>,
  reply: FastifyReply,
): Promise<void> {
  await unassignUserFromJob(
    parseId(request.params.seriesId, 'seriesId'),
    parseId(request.params.jobId, 'jobId'),
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
