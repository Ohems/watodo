import { z } from 'zod';

export const certificationPushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  organizationId: z.uuid(),
});

export const certificationUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const certificationParamsSchema = z.object({
  organizationId: z.uuid(),
  certificationId: z.coerce.number().int(),
});

export type CertificationPush = z.infer<typeof certificationPushSchema>;
export type CertificationUpdate = z.infer<typeof certificationUpdateSchema>;
