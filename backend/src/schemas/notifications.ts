import { z } from 'zod';

export const notificationUpdateSchema = z.object({
  isRead: z.boolean().optional(),
});

export type NotificationUpdate = z.infer<typeof notificationUpdateSchema>;
