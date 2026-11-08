import { z } from 'zod';

export const organizationParamsSchema = z.object({
  organizationId: z.uuid(),
});

export const organizationUserParamsSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
});

export const organizationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  defaultTimezone: z.string().min(1).max(64).optional(),
});

export type OrganizationUpdate = z.infer<typeof organizationUpdateSchema>;
