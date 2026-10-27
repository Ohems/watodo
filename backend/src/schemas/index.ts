import { z } from 'zod';

export const incrementalSchema = z.number().int().min(0);
export const createdAtSchema = z.coerce.date();
export const updatedAtSchema = z.coerce.date();

export const userStateSchema = z.enum(['active', 'inactive']);

/**
 * E.164 phone number: a plus sign followed by the country code and the
 * national number (7-15 digits in total).
 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must include the country code (e.g. +358401234567)');

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

/**
 * Fields a user may change on their own account. Unlike userPushSchema this
 * deliberately has no `state` field: account state stays an administrative
 * concern.
 */
export const userSelfUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.email().optional(),
  description: z.string().nullable().optional(),
  phoneNumber: phoneNumberSchema.nullable().optional(),
});

export const linkRequestSchema = z.object({
  returnUrl: z.string().min(1).optional(),
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

// --- Occurrence filter ---

export const occurrenceFilterSchema = z.object({
  scope: z.enum(['all', 'team', 'mine']).optional(),
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
export type UserSelfUpdate = z.infer<typeof userSelfUpdateSchema>;
export type LinkRequest = z.infer<typeof linkRequestSchema>;
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

// --- Teams ---

export const teamPushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  organizationId: z.uuid(),
});

export const teamUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const teamMemberSchema = z.object({
  userId: z.uuid(),
});

// --- Sites ---

export const sitePushSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  organizationId: z.uuid(),
});

export const siteUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const siteParamsSchema = z.object({
  organizationId: z.uuid(),
  siteId: z.uuid(),
});

// --- Rooms ---

export const roomPushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  siteId: z.uuid(),
  organizationId: z.uuid(),
});

export const roomUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const roomParamsSchema = z.object({
  organizationId: z.uuid(),
  siteId: z.uuid(),
  roomId: z.uuid(),
});

// --- Work Roles ---

export const workRolePushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  organizationId: z.uuid(),
});

export const workRoleUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const workRoleParamsSchema = z.object({
  organizationId: z.uuid(),
  workRoleId: z.coerce.number().int(),
});

// --- Certifications ---

export const certificationPushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  organizationId: z.uuid(),
});

export const certificationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const certificationParamsSchema = z.object({
  organizationId: z.uuid(),
  certificationId: z.coerce.number().int(),
});

// --- User Work Roles ---

export const userWorkRolePushSchema = z.object({
  workRoleId: z.number().int(),
  isQualified: z.boolean().optional(),
  notes: z.string().optional(),
});

export const userWorkRoleUpdateSchema = z.object({
  isQualified: z.boolean().optional(),
  notes: z.string().optional(),
});

export const userWorkRoleParamsSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  workRoleId: z.coerce.number().int(),
});

// --- User Certifications ---

export const userCertificationPushSchema = z.object({
  certificationId: z.number().int(),
  certificationDate: z.iso.date().nullable().optional(),
  validUntilDate: z.iso.date().nullable().optional(),
});

export const userCertificationUpdateSchema = z.object({
  certificationDate: z.iso.date().nullable().optional(),
  validUntilDate: z.iso.date().nullable().optional(),
});

export const userCertificationParamsSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  certificationId: z.coerce.number().int(),
});

// --- Certification Work Roles (link certifications to work roles) ---

export const certificationWorkRolePushSchema = z.object({
  certificationId: z.number().int(),
});

export const certificationWorkRoleParamsSchema = z.object({
  organizationId: z.uuid(),
  workRoleId: z.coerce.number().int(),
  certificationId: z.coerce.number().int(),
});

// --- Notifications ---

export const notificationUpdateSchema = z.object({
  isRead: z.boolean().optional(),
});

// --- Paginated table query ---

export const tableQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().optional(),
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

// --- Calendar list query ---

export const calendarListQuerySchema = z.object({
  organizationId: z.uuid(),
});

// --- Event series site/room/team update ---

export const eventSeriesConfigSchema = z.object({
  siteId: z.uuid().nullable().optional(),
  roomId: z.uuid().nullable().optional(),
  reserveWholeSite: z.boolean().optional(),
  teamIds: z.array(z.uuid()).optional(),
});

export type TeamPush = z.infer<typeof teamPushSchema>;
export type TeamUpdate = z.infer<typeof teamUpdateSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
export type SitePush = z.infer<typeof sitePushSchema>;
export type SiteUpdate = z.infer<typeof siteUpdateSchema>;
export type RoomPush = z.infer<typeof roomPushSchema>;
export type RoomUpdate = z.infer<typeof roomUpdateSchema>;
export type WorkRolePush = z.infer<typeof workRolePushSchema>;
export type WorkRoleUpdate = z.infer<typeof workRoleUpdateSchema>;
export type CertificationPush = z.infer<typeof certificationPushSchema>;
export type CertificationUpdate = z.infer<typeof certificationUpdateSchema>;
export type UserWorkRolePush = z.infer<typeof userWorkRolePushSchema>;
export type UserWorkRoleUpdate = z.infer<typeof userWorkRoleUpdateSchema>;
export type UserCertificationPush = z.infer<typeof userCertificationPushSchema>;
export type UserCertificationUpdate = z.infer<typeof userCertificationUpdateSchema>;
export type CertificationWorkRolePush = z.infer<typeof certificationWorkRolePushSchema>;
export type NotificationUpdate = z.infer<typeof notificationUpdateSchema>;
export type TableQuery = z.infer<typeof tableQuerySchema>;
export type EventSeriesListQuery = z.infer<typeof eventSeriesListQuerySchema>;
export type EventSeriesQuery = z.infer<typeof eventSeriesQuerySchema>;
export type CalendarListQuery = z.infer<typeof calendarListQuerySchema>;
export type EventSeriesConfig = z.infer<typeof eventSeriesConfigSchema>;
