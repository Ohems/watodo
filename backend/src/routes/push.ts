import type { FastifyInstance } from 'fastify';
import {
  deletePushSubscriptionHandler,
  getVapidPublicKeyHandler,
  listPushSubscriptionsHandler,
  registerPushSubscriptionHandler,
} from '../controllers/push-controller.js';
import { requirePermissions } from '../middleware/auth.js';

interface PushSubscriptionParams {
  Params: { subscriptionId: string };
}

export async function pushRoutes(app: FastifyInstance): Promise<void> {
  // VAPID public key the service worker needs for pushManager.subscribe().
  app.get(
    '/api/v1/push/vapid-public-key',
    { preHandler: requirePermissions() },
    getVapidPublicKeyHandler,
  );

  // Self-service web push subscriptions: any authenticated user manages their
  // own browser/device endpoints, no extra permission required.
  app.get(
    '/api/v1/users/@me/push-subscriptions',
    { preHandler: requirePermissions() },
    listPushSubscriptionsHandler,
  );

  app.post(
    '/api/v1/users/@me/push-subscriptions',
    { preHandler: requirePermissions() },
    registerPushSubscriptionHandler,
  );

  app.delete<PushSubscriptionParams>(
    '/api/v1/users/@me/push-subscriptions/:subscriptionId',
    { preHandler: requirePermissions() },
    deletePushSubscriptionHandler,
  );
}
