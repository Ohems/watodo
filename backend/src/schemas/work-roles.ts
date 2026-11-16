import { z } from 'zod';

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

// --- Certification Work Roles (link certifications to work roles) ---

export const certificationWorkRolePushSchema = z.object({
  certificationId: z.number().int(),
});

export const certificationWorkRoleParamsSchema = z.object({
  organizationId: z.uuid(),
  workRoleId: z.coerce.number().int(),
  certificationId: z.coerce.number().int(),
});

export type WorkRolePush = z.infer<typeof workRolePushSchema>;
export type WorkRoleUpdate = z.infer<typeof workRoleUpdateSchema>;
export type CertificationWorkRolePush = z.infer<typeof certificationWorkRolePushSchema>;
