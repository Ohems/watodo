import { z } from 'zod';

export const sitePushSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  organizationId: z.uuid(),
});

export const siteUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export const siteParamsSchema = z.object({
  organizationId: z.uuid(),
  siteId: z.uuid(),
});

export type SitePush = z.infer<typeof sitePushSchema>;
export type SiteUpdate = z.infer<typeof siteUpdateSchema>;
