import { z } from 'zod';

export const incrementalSchema = z.number().int().min(0);
export const createdAtSchema = z.coerce.date();
export const updatedAtSchema = z.coerce.date();

export const userStateSchema = z.enum(['active', 'inactive']);

export const userPushSchema = z.object({
  name: z.string().optional(),
  email: z.email().optional(),
  description: z.string().nullable().optional(),
  state: userStateSchema.optional(),
});

export const userSchema = userPushSchema.extend({
  id: z.string(),
  createdAt: createdAtSchema,
  updatedAt: updatedAtSchema,
});

export const userQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  archived: z.coerce.boolean().optional(),
  active: z.coerce.boolean().optional(),
});

export const providerSchema = z.enum(['discord', 'google', 'microsoft']);

export const loginQuerySchema = z.object({
  state: z.string().optional(),
  returnUrl: z.string().optional(),
});

export const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
});

export const organizationParamsSchema = z.object({
  organizationId: z.uuid(),
});

export const roleParamsSchema = z.object({
  organizationId: z.uuid(),
  roleId: z.coerce.number().int(),
});

export const roleAssignmentParamsSchema = z.object({
  organizationId: z.uuid(),
  roleId: z.coerce.number().int(),
  assignmentId: z.coerce.number().int(),
});

export const rolePushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

export const roleUpdateSchema = rolePushSchema.partial();

export const roleAssignmentSchema = z.object({
  userId: z.uuid(),
  teamId: z.uuid().optional(),
  eventTypeId: z.number().int().optional(),
});

export const organizationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  defaultTimezone: z.string().min(1).max(64).optional(),
});

export const operationSchema = z.object({
  id: z.number().int().optional(),
  name: z.string(),
  description: z.string().optional(),
  requirements: z.string().optional(),
  location: z.string().optional(),
  assignments: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: z.string(),
        description: z.string().optional(),
      }),
    )
    .optional(),
});

export const opAssignmentSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const calendarPushSchema = z.object({
  name: z.string().min(1),
  organizationId: z.uuid(),
  googleCalendarId: z.string().nullable().optional(),
});

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

export const occurrenceRangeQuerySchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  calendarId: z.uuid().optional(),
});

export const occurrenceStartSchema = z.iso.datetime();

export const rescheduleOccurrenceSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime().optional(),
});

export const eventJobPushSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  occurrenceStart: z.iso.datetime().nullable().optional(),
});

export const eventJobUpdateSchema = eventJobPushSchema.partial();

export const eventJobAssignmentSchema = z.object({
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

export const eventJobsQuerySchema = z.object({
  occurrenceStart: z.iso.datetime().optional(),
});

export type UserPush = z.infer<typeof userPushSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type AuthProviderParam = z.infer<typeof providerSchema>;
export type RolePush = z.infer<typeof rolePushSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
export type OrganizationUpdate = z.infer<typeof organizationUpdateSchema>;
export type OperationInput = z.infer<typeof operationSchema>;
export type OpAssignmentInput = z.infer<typeof opAssignmentSchema>;
export type CalendarPush = z.infer<typeof calendarPushSchema>;
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;
export type EventSeriesPush = z.infer<typeof eventSeriesPushSchema>;
export type EventSeriesUpdate = z.infer<typeof eventSeriesUpdateSchema>;
export type OccurrenceRangeQuery = z.infer<typeof occurrenceRangeQuerySchema>;
export type RescheduleOccurrenceInput = z.infer<typeof rescheduleOccurrenceSchema>;
export type EventJobPush = z.infer<typeof eventJobPushSchema>;
export type EventJobUpdate = z.infer<typeof eventJobUpdateSchema>;
export type EventJobAssignmentInput = z.infer<typeof eventJobAssignmentSchema>;
export type EventCommentPush = z.infer<typeof eventCommentPushSchema>;
export type EventCommentUpdate = z.infer<typeof eventCommentUpdateSchema>;
export type EventCommentsQuery = z.infer<typeof eventCommentsQuerySchema>;
export type EventJobsQuery = z.infer<typeof eventJobsQuerySchema>;
