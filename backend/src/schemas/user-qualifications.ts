import { z } from 'zod';

// --- User Work Roles ---

export const userWorkRolePushSchema = z.object({
  workRoleId: z.number().int(),
  isQualified: z.boolean().optional(),
  notes: z.string().optional(),
});

export const userWorkRoleUpdateSchema = z.object({
  isQualified: z.boolean().optional(),
  notes: z.string().optional(),
});

export const userWorkRoleParamsSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  workRoleId: z.coerce.number().int(),
});

// --- User Certifications ---

export const userCertificationPushSchema = z.object({
  certificationId: z.number().int(),
  certificationDate: z.iso.date().nullable().optional(),
  validUntilDate: z.iso.date().nullable().optional(),
});

export const userCertificationUpdateSchema = z.object({
  certificationDate: z.iso.date().nullable().optional(),
  validUntilDate: z.iso.date().nullable().optional(),
});

export const userCertificationParamsSchema = z.object({
  organizationId: z.uuid(),
  userId: z.uuid(),
  certificationId: z.coerce.number().int(),
});

export type UserWorkRolePush = z.infer<typeof userWorkRolePushSchema>;
export type UserWorkRoleUpdate = z.infer<typeof userWorkRoleUpdateSchema>;
export type UserCertificationPush = z.infer<typeof userCertificationPushSchema>;
export type UserCertificationUpdate = z.infer<typeof userCertificationUpdateSchema>;
