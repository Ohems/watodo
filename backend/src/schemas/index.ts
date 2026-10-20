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

export type UserPush = z.infer<typeof userPushSchema>;
export type UserQuery = z.infer<typeof userQuerySchema>;
export type AuthProviderParam = z.infer<typeof providerSchema>;
export type RolePush = z.infer<typeof rolePushSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
export type OperationInput = z.infer<typeof operationSchema>;
export type OpAssignmentInput = z.infer<typeof opAssignmentSchema>;
