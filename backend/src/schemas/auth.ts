import { z } from 'zod';

export const providerSchema = z.enum(['discord', 'google', 'microsoft']);

export const loginQuerySchema = z.object({
  state: z.string().optional(),
  returnUrl: z.string().optional(),
});

export const callbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
});

export const linkRequestSchema = z.object({
  returnUrl: z.string().min(1).optional(),
});

export type AuthProviderParam = z.infer<typeof providerSchema>;
export type LinkRequest = z.infer<typeof linkRequestSchema>;
