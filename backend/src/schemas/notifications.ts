import { z } from 'zod';
import { isNotificationMessageKey } from '../i18n/messages.js';

export const notificationUpdateSchema = z.object({
  isRead: z.boolean().optional(),
});

export type NotificationUpdate = z.infer<typeof notificationUpdateSchema>;

/** Delivery channels a notification can be sent through. */
export const notificationChannelSchema = z.enum(['in_app', 'email', 'push']);

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** A notification message key of the catalog (see i18n/messages.ts). */
export const notificationMessageKeySchema = z
  .string()
  .refine(isNotificationMessageKey, { message: 'Unknown notification message key' });

/** Path params of the per-preference update endpoint. */
export const notificationPreferenceParamsSchema = z.object({
  messageKey: notificationMessageKeySchema,
  channel: notificationChannelSchema,
});

/** Body of the per-preference update endpoint. */
export const notificationPreferenceUpdateSchema = z.object({
  enabled: z.boolean(),
});

export type NotificationPreferenceParams = z.infer<typeof notificationPreferenceParamsSchema>;
export type NotificationPreferenceUpdate = z.infer<typeof notificationPreferenceUpdateSchema>;
