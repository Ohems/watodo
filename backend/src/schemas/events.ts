import { z } from 'zod';

/** ISO 8601 weekday: 1 = Monday .. 7 = Sunday. */
export const isoWeekdaySchema = z.number().int().min(1).max(7);

/**
 * Recurrence rule for an event series. The backend serializes this to a
 * canonical RRULE string with the rrule library; `until` is an instant and is
 * stored as the wall-clock time in the series' timezone.
 */
const recurrenceBaseSchema = {
  interval: z.number().int().min(1).max(366).optional(),
  until: z.iso.datetime().optional(),
  count: z.number().int().min(1).max(100000).optional(),
};

export const recurrenceSchema = z
  .discriminatedUnion('freq', [
    z.strictObject({
      freq: z.literal('DAILY'),
      byWeekdays: z.array(isoWeekdaySchema).min(1).max(7).optional(),
      ...recurrenceBaseSchema,
    }),
    z.strictObject({
      freq: z.literal('WEEKLY'),
      byWeekdays: z.array(isoWeekdaySchema).min(1).max(7).optional(),
      ...recurrenceBaseSchema,
    }),
    z.strictObject({
      freq: z.literal('MONTHLY'),
      byMonthDays: z.array(z.number().int().min(1).max(31)).min(1).max(31).optional(),
      ...recurrenceBaseSchema,
    }),
    z.strictObject({
      freq: z.literal('YEARLY'),
      ...recurrenceBaseSchema,
    }),
  ])
  .nullable();

export const eventSeriesPushSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  calendarId: z.uuid(),
  start: z.iso.datetime(),
  durationMinutes: z.number().int().min(1).max(43200).optional(),
  isAllDay: z.boolean().optional(),
  timezone: z.string().min(1).max(64).optional(),
  isVisible: z.boolean().optional(),
  recurrence: recurrenceSchema.optional(),
});

export const eventSeriesUpdateSchema = eventSeriesPushSchema.partial();

// --- Occurrence filter ---

export const occurrenceFilterSchema = z.object({
  scope: z.enum(['all', 'team', 'mine', 'involved']).optional(),
  siteId: z.uuid().optional(),
  roomId: z.uuid().optional(),
  teamId: z.uuid().optional(),
});

export type OccurrenceFilter = z.infer<typeof occurrenceFilterSchema>;

// The organization filter is optional here because the Home page lists
// occurrences across all organizations (every other view passes it).
export const occurrenceRangeQuerySchema = z
  .object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    calendarId: z.uuid().optional(),
    organizationId: z.uuid().optional(),
  })
  .extend(occurrenceFilterSchema.shape);

export const occurrenceStartSchema = z.iso.datetime();

// --- User event assignments (org user profile card) ---

// The date span is optional; the controller defaults to one month back and
// forward from the current date.
export const userEventAssignmentsQuerySchema = z.object({
  start: z.iso.datetime().optional(),
  end: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type UserEventAssignmentsQuery = z.infer<typeof userEventAssignmentsQuerySchema>;

export const rescheduleOccurrenceSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime().optional(),
});

export const eventWorkRolePushSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  occurrenceStart: z.iso.datetime().nullable().optional(),
  /** Scope the slot to a materialized occurrence (inherited copy). */
  occurrenceId: z.number().int().nullable().optional(),
  isCritical: z.boolean().optional(),
  workRoleId: z.number().int().nullable().optional(),
});

export const eventWorkRoleUpdateSchema = eventWorkRolePushSchema.partial();

export const eventWorkRoleAssignmentSchema = z.object({
  userId: z.uuid(),
});

export const eventCommentPushSchema = z.object({
  body: z.string().min(1),
  occurrenceStart: z.iso.datetime().nullable().optional(),
});

export const eventCommentUpdateSchema = z.object({
  body: z.string().min(1),
});

export const eventCommentsQuerySchema = z.object({
  occurrenceStart: z.iso.datetime().optional(),
});

export const eventWorkRolesQuerySchema = z.object({
  occurrenceStart: z.iso.datetime().optional(),
});

// --- Event series management query ---

// The management view only ever shows the active organization, so the
// organization filter is required.
export const eventSeriesListQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().optional(),
  startFrom: z.iso.datetime().optional(),
  startTo: z.iso.datetime().optional(),
  siteId: z.uuid().optional(),
  roomId: z.uuid().optional(),
  teamId: z.uuid().optional(),
  hasTeam: z.coerce.boolean().optional(),
  organizationId: z.uuid(),
});

// --- Event series list query ---

export const eventSeriesQuerySchema = z.object({
  calendarId: z.uuid().optional(),
  organizationId: z.uuid(),
});

// --- Event series site/room/team update ---

export const eventSeriesConfigSchema = z.object({
  siteId: z.uuid().nullable().optional(),
  roomId: z.uuid().nullable().optional(),
  reserveWholeSite: z.boolean().optional(),
  teamIds: z.array(z.uuid()).optional(),
});

export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
export type EventSeriesPush = z.infer<typeof eventSeriesPushSchema>;
export type EventSeriesUpdate = z.infer<typeof eventSeriesUpdateSchema>;
export type OccurrenceRangeQuery = z.infer<typeof occurrenceRangeQuerySchema>;
export type RescheduleOccurrenceInput = z.infer<typeof rescheduleOccurrenceSchema>;
export type EventWorkRolePush = z.infer<typeof eventWorkRolePushSchema>;
export type EventWorkRoleUpdate = z.infer<typeof eventWorkRoleUpdateSchema>;
export type EventWorkRoleAssignmentInput = z.infer<typeof eventWorkRoleAssignmentSchema>;
export type EventCommentPush = z.infer<typeof eventCommentPushSchema>;
export type EventCommentUpdate = z.infer<typeof eventCommentUpdateSchema>;
export type EventCommentsQuery = z.infer<typeof eventCommentsQuerySchema>;
export type EventWorkRolesQuery = z.infer<typeof eventWorkRolesQuerySchema>;
export type EventSeriesListQuery = z.infer<typeof eventSeriesListQuerySchema>;
export type EventSeriesQuery = z.infer<typeof eventSeriesQuerySchema>;
export type EventSeriesConfig = z.infer<typeof eventSeriesConfigSchema>;
