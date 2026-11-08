import { z } from 'zod';

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

export type RoomPush = z.infer<typeof roomPushSchema>;
export type RoomUpdate = z.infer<typeof roomUpdateSchema>;
