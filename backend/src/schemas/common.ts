import { z } from 'zod';

export const incrementalSchema = z.number().int().min(0);
export const createdAtSchema = z.coerce.date();
export const updatedAtSchema = z.coerce.date();

// --- Paginated table query ---

export const tableQuerySchema = z.object({
  page: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().optional(),
});

export type TableQuery = z.infer<typeof tableQuerySchema>;
