import type { FastifyInstance } from 'fastify';
import {
  assignUserToWorkRoleHandler,
  cancelOccurrenceHandler,
  createEventCommentHandler,
  createEventSeriesHandler,
  createEventWorkRoleHandler,
  deleteEventCommentHandler,
  deleteEventSeriesHandler,
  deleteEventWorkRoleHandler,
  deleteExceptionHandler,
  getEventSeriesHandler,
  getEventSeriesManagementHandler,
  getOccurrenceDetailByRefHandler,
  getOccurrenceDetailHandler,
  getOccurrencesHandler,
  getSeriesOccurrencesHandler,
  importParentSlotsHandler,
  listEventCommentsHandler,
  listEventSeriesHandler,
  listEventSeriesPaginatedHandler,
  listEventWorkRolesHandler,
  listExceptionsHandler,
  rescheduleOccurrenceHandler,
  splitEventSeriesHandler,
  unassignUserFromWorkRoleHandler,
  updateEventCommentHandler,
  updateEventSeriesConfigHandler,
  updateEventSeriesHandler,
  updateEventWorkRoleHandler,
} from '../controllers/event-controller.js';
import { requirePermissions } from '../middleware/auth.js';
import { PERMISSIONS } from '../permissions.js';

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

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  const read = requirePermissions(PERMISSIONS.EVENTS_READ);
  const write = requirePermissions(PERMISSIONS.EVENTS_WRITE);

  // Event series
  app.get<{ Querystring: unknown }>(
    '/api/v1/event-series',
    { preHandler: read },
    listEventSeriesHandler,
  );
  app.post('/api/v1/event-series', { preHandler: write }, createEventSeriesHandler);

  // Paginated event series list for the management view
  app.get('/api/v1/event-series/management', { preHandler: read }, listEventSeriesPaginatedHandler);

  // Occurrences of all series within a time range (used by calendars)
  app.get('/api/v1/event-series/occurrences', { preHandler: read }, getOccurrencesHandler);

  // A single occurrence by its reference (stable numeric ID, or a temporary
  // `tmp:{seriesId}:{isoStart}` key for instances not yet materialized).
  app.get<OccurrenceRefParams>(
    '/api/v1/event-occurrences/:occurrenceRef',
    { preHandler: read },
    getOccurrenceDetailByRefHandler,
  );

  // Import parent (series-level) work role slots into a materialized occurrence
  app.post<OccurrenceRefParams>(
    '/api/v1/event-occurrences/:occurrenceRef/import-slots',
    { preHandler: write },
    importParentSlotsHandler,
  );

  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId',
    { preHandler: read },
    getEventSeriesHandler,
  );

  // Event series management detail (with location and teams)
  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId/management',
    { preHandler: read },
    getEventSeriesManagementHandler,
  );

  // Update location and team assignments
  app.patch<SeriesParams>(
    '/api/v1/event-series/:seriesId/config',
    { preHandler: write },
    updateEventSeriesConfigHandler,
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

  // Work role slots (series-level template or scoped to one occurrence)
  app.get<SeriesParams>(
    '/api/v1/event-series/:seriesId/work-roles',
    { preHandler: read },
    listEventWorkRolesHandler,
  );
  app.post<SeriesParams>(
    '/api/v1/event-series/:seriesId/work-roles',
    { preHandler: write },
    createEventWorkRoleHandler,
  );
  app.patch<WorkRoleParams>(
    '/api/v1/event-series/:seriesId/work-roles/:workRoleId',
    { preHandler: write },
    updateEventWorkRoleHandler,
  );
  app.delete<WorkRoleParams>(
    '/api/v1/event-series/:seriesId/work-roles/:workRoleId',
    { preHandler: write },
    deleteEventWorkRoleHandler,
  );

  // Users assigned to work role slots
  app.post<WorkRoleParams>(
    '/api/v1/event-series/:seriesId/work-roles/:workRoleId/assignments',
    { preHandler: write },
    assignUserToWorkRoleHandler,
  );
  app.delete<WorkRoleAssignmentParams>(
    '/api/v1/event-series/:seriesId/work-roles/:workRoleId/assignments/:assignmentId',
    { preHandler: write },
    unassignUserFromWorkRoleHandler,
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
