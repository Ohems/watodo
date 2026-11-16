import { z } from 'zod';

/**
 * Registry of notification message keys and the params their templates
 * interpolate. createNotification validates params against these schemas so
 * a sender cannot store params that do not match the template placeholders.
 */
export const notificationMessageParamsSchemas = {
  welcome: z.object({}),
  upcomingEvent: z.object({ eventTitle: z.string() }),
  // `start` (ISO datetime) is set for occurrence-level slots/comments.
  workRoleAssigned: z.object({
    eventTitle: z.string(),
    role: z.string(),
    start: z.string().optional(),
  }),
  workRoleUnassigned: z.object({
    eventTitle: z.string(),
    role: z.string(),
    start: z.string().optional(),
  }),
  newEventComment: z.object({ eventTitle: z.string(), start: z.string().optional() }),
  roleAssigned: z.object({ roleName: z.string() }),
  eventCancelled: z.object({ eventTitle: z.string(), start: z.string() }),
  eventRescheduled: z.object({
    eventTitle: z.string(),
    start: z.string(),
    newStart: z.string(),
    newEnd: z.string(),
  }),
  /** Coordinator alert: critical slots of an upcoming occurrence still unfilled. */
  unfilledCriticalSlot: z.object({
    eventTitle: z.string(),
    start: z.string(),
    /** Comma-separated titles of the unfilled critical slots. */
    roles: z.string(),
  }),
  assignmentRemovedDueToAbsence: z.object({
    userName: z.string(),
    eventTitle: z.string(),
    start: z.string(),
    absenceType: z.string(),
    absenceStart: z.string(),
    absenceEnd: z.string(),
  }),
} as const;

export type NotificationMessageKey = keyof typeof notificationMessageParamsSchemas;

/**
 * Settings category of each message key: `general` notifications are sent to
 * everyone concerned (e.g. assignees, event participants), `management` ones
 * only to event/team managers (coordinator alerts). The settings UI groups
 * the toggles by this category.
 */
export type NotificationMessageCategory = 'general' | 'management';

export const notificationMessageKeyCategories: Record<
  NotificationMessageKey,
  NotificationMessageCategory
> = {
  welcome: 'general',
  upcomingEvent: 'general',
  workRoleAssigned: 'general',
  workRoleUnassigned: 'general',
  newEventComment: 'general',
  roleAssigned: 'general',
  eventCancelled: 'general',
  eventRescheduled: 'general',
  unfilledCriticalSlot: 'management',
  assignmentRemovedDueToAbsence: 'management',
};

/** Message keys the user can toggle in the settings (all except `welcome`, which is always sent). */
export const configurableNotificationMessageKeys = (
  Object.keys(notificationMessageParamsSchemas) as NotificationMessageKey[]
).filter(key => key !== 'welcome');

export function isNotificationMessageKey(key: string): key is NotificationMessageKey {
  return key in notificationMessageParamsSchemas;
}

/** Validates and normalizes the params of a message (throws on mismatch). */
export function notificationMessageParams(
  key: NotificationMessageKey,
  params: unknown,
): Record<string, unknown> {
  return notificationMessageParamsSchemas[key].parse(params);
}
