import { z } from 'zod';

export const absenceTypeSchema = z.enum(['sick', 'away', 'other']);

const absenceBaseSchema = z.object({
  type: absenceTypeSchema,
  description: z.string().optional(),
  /** First day of the absence (inclusive), ISO date. */
  startDate: z.iso.date(),
  /** Last day of the absence (inclusive), ISO date. */
  endDate: z.iso.date(),
});

export const absencePushSchema = absenceBaseSchema.refine(data => data.endDate >= data.startDate, {
  message: 'End date must not be before the start date',
  path: ['endDate'],
});

export const absenceUpdateSchema = absenceBaseSchema.partial();

/** Optional range filter for the absence list (overlaps [start, end]). */
export const absenceQuerySchema = z.object({
  start: z.iso.date().optional(),
  end: z.iso.date().optional(),
});

export const absenceParamsSchema = z.object({
  absenceId: z.coerce.number().int(),
});

export type AbsenceType = z.infer<typeof absenceTypeSchema>;
export type AbsencePush = z.infer<typeof absencePushSchema>;
export type AbsenceUpdate = z.infer<typeof absenceUpdateSchema>;
export type AbsenceQuery = z.infer<typeof absenceQuerySchema>;
