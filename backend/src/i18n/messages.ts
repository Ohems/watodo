import { z } from 'zod';

/**
 * Registry of notification message keys and the params their templates
 * interpolate. createNotification validates params against these schemas so
 * a sender cannot store params that do not match the template placeholders.
 */
export const notificationMessageParamsSchemas = {
  welcome: z.object({}),
  organizationCreated: z.object({ organizationName: z.string() }),
  upcomingEvent: z.object({ eventTitle: z.string() }),
  workRoleAssigned: z.object({ eventTitle: z.string(), role: z.string() }),
  newEventComment: z.object({ eventTitle: z.string() }),
  roleAssigned: z.object({ roleName: z.string() }),
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
