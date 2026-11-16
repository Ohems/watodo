import { z } from 'zod';

export const calendarPushSchema = z.object({
  name: z.string().min(1),
  organizationId: z.uuid(),
  googleCalendarId: z.string().nullable().optional(),
});

// --- Calendar list query ---

export const calendarListQuerySchema = z.object({
  organizationId: z.uuid(),
});

export type CalendarPush = z.infer<typeof calendarPushSchema>;
export type CalendarListQuery = z.infer<typeof calendarListQuerySchema>;
