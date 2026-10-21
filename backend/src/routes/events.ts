import type { FastifyInstance } from 'fastify';
import {
  assignUserToJobHandler,
  cancelOccurrenceHandler,
  createEventCommentHandler,
  createEventJobHandler,
  createEventSeriesHandler,
  deleteEventCommentHandler,
  deleteEventJobHandler,
  deleteEventSeriesHandler,
  deleteExceptionHandler,
  getEventSeriesHandler,
  getOccurrenceDetailHandler,
  getOccurrencesHandler,
  getSeriesOccurrencesHandler,
  listEventCommentsHandler,
  listEventJobsHandler,
  listEventSeriesHandler,
  listExceptionsHandler,
  rescheduleOccurrenceHandler,
  splitEventSeriesHandler,
  unassignUserFromJobHandler,
  updateEventCommentHandler,
  updateEventJobHandler,
  updateEventSeriesHandler,
} from '../controllers/event-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

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

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.EVENTS_READ);
  const write = requirePermissions(PERMISSIONS.EVENTS_WRITE);

  // Event series
  app.get<{ Querystring: { calendarId?: string } }>(
    '/api/v1/event-series',
    { preHandler: read },
    listEventSeriesHandler,
  );
  app.post('/api/v1/event-series', { preHandler: write }, createEventSeriesHandler);

  // Occurrences of all series within a time range (used by calendars)
  app.get('/api/v1/event-series/occurrences', { preHandler: read }, getOccurrencesHandler);

  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId',
    { preHandler: read },
    getEventSeriesHandler,
  );
  app.patch<SeriesParams>(
    '/api/v1/event-series/:seriesId',
    { preHandler: write },
    updateEventSeriesHandler,
  );
  app.delete<SeriesParams>(
    '/api/v1/event-series/:seriesId',
    { preHandler: write },
    deleteEventSeriesHandler,
  );

  // Occurrences of one series within a time range
  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId/occurrences',
    { preHandler: read },
    getSeriesOccurrencesHandler,
  );

  // A single occurrence of a series
  app.get<OccurrenceParams>(
    '/api/v1/event-series/:seriesId/occurrences/:occurrenceStart',
    { preHandler: read },
    getOccurrenceDetailHandler,
  );

  // Cancel / reschedule / restore a single occurrence
  app.post<OccurrenceParams>(
    '/api/v1/event-series/:seriesId/occurrences/:occurrenceStart/cancel',
    { preHandler: write },
    cancelOccurrenceHandler,
  );
  app.post<OccurrenceParams>(
    '/api/v1/event-series/:seriesId/occurrences/:occurrenceStart/reschedule',
    { preHandler: write },
    rescheduleOccurrenceHandler,
  );
  app.post<OccurrenceParams>(
    '/api/v1/event-series/:seriesId/occurrences/:occurrenceStart/split',
    { preHandler: write },
    splitEventSeriesHandler,
  );
  app.delete<OccurrenceParams>(
    '/api/v1/event-series/:seriesId/occurrences/:occurrenceStart/exception',
    { preHandler: write },
    deleteExceptionHandler,
  );

  // Exceptions of a series
  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId/exceptions',
    { preHandler: read },
    listExceptionsHandler,
  );

  // Job slots (series-wide or scoped to one occurrence)
  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId/jobs',
    { preHandler: read },
    listEventJobsHandler,
  );
  app.post<SeriesParams>(
    '/api/v1/event-series/:seriesId/jobs',
    { preHandler: write },
    createEventJobHandler,
  );
  app.patch<JobParams>(
    '/api/v1/event-series/:seriesId/jobs/:jobId',
    { preHandler: write },
    updateEventJobHandler,
  );
  app.delete<JobParams>(
    '/api/v1/event-series/:seriesId/jobs/:jobId',
    { preHandler: write },
    deleteEventJobHandler,
  );

  // Users assigned to job slots
  app.post<JobParams>(
    '/api/v1/event-series/:seriesId/jobs/:jobId/assignments',
    { preHandler: write },
    assignUserToJobHandler,
  );
  app.delete<JobAssignmentParams>(
    '/api/v1/event-series/:seriesId/jobs/:jobId/assignments/:assignmentId',
    { preHandler: write },
    unassignUserFromJobHandler,
  );

  // Comments (series-wide or scoped to one occurrence)
  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId/comments',
    { preHandler: read },
    listEventCommentsHandler,
  );
  app.post<SeriesParams>(
    '/api/v1/event-series/:seriesId/comments',
    { preHandler: write },
    createEventCommentHandler,
  );
  app.patch<CommentParams>(
    '/api/v1/event-series/:seriesId/comments/:commentId',
    { preHandler: write },
    updateEventCommentHandler,
  );
  app.delete<CommentParams>(
    '/api/v1/event-series/:seriesId/comments/:commentId',
    { preHandler: write },
    deleteEventCommentHandler,
  );
}
