import { z } from 'zod';

/**
 * Body of the push subscription registration endpoint. Matches the shape of
 * `PushSubscription.toJSON()` in the browser.
 */
export const pushSubscriptionRegisterSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

/** Path params of the push subscription delete endpoint. */
export const pushSubscriptionParamsSchema = z.object({
  subscriptionId: z.coerce.number().int().positive(),
});

export type PushSubscriptionRegister = z.infer<typeof pushSubscriptionRegisterSchema>;
export type PushSubscriptionParams = z.infer<typeof pushSubscriptionParamsSchema>;
