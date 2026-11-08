import { z } from 'zod';

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

export type RolePush = z.infer<typeof rolePushSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
