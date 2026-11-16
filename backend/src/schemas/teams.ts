import { z } from 'zod';

export const teamPushSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  organizationId: z.uuid(),
  teamLeaderId: z.uuid().nullable().optional(),
  /** Work roles assigned to the team. */
  workRoleIds: z.array(z.number().int()).optional(),
  /** Event series assigned to the team. */
  eventSeriesIds: z.array(z.number().int()).optional(),
});

export const teamUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  teamLeaderId: z.uuid().nullable().optional(),
  workRoleIds: z.array(z.number().int()).optional(),
  eventSeriesIds: z.array(z.number().int()).optional(),
});

export const teamMemberSchema = z.object({
  userId: z.uuid(),
  /** When true, the new member can manage this specific team. */
  isManager: z.boolean().optional(),
});

export const teamMemberUpdateSchema = z.object({
  isManager: z.boolean().optional(),
});

export type TeamPush = z.infer<typeof teamPushSchema>;
export type TeamUpdate = z.infer<typeof teamUpdateSchema>;
export type TeamMemberInput = z.infer<typeof teamMemberSchema>;
export type TeamMemberUpdate = z.infer<typeof teamMemberUpdateSchema>;
