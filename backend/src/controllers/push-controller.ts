import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { getAuth } from '../middleware/auth.js';
import { pushSubscriptionParamsSchema, pushSubscriptionRegisterSchema } from '../schemas/index.js';
import {
  deletePushSubscription,
  listPushSubscriptions,
  registerPushSubscription,
} from '../services/push-service.js';

interface PushSubscriptionParams {
  Params: { subscriptionId: string };
}

/** Returns the VAPID public key the browser needs to subscribe to push. */
export async function getVapidPublicKeyHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  return reply.status(200).send({ publicKey: config.vapidPublicKey });
}

export async function listPushSubscriptionsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const subscriptions = await listPushSubscriptions(auth.user.id);
  return reply.status(200).send(subscriptions);
}

export async function registerPushSubscriptionHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const data = pushSubscriptionRegisterSchema.parse(request.body);
  const subscription = await registerPushSubscription(auth.user.id, data);
  return reply.status(200).send(subscription);
}

export async function deletePushSubscriptionHandler(
  request: FastifyRequest<PushSubscriptionParams>,
  reply: FastifyReply,
): Promise<void> {
  const auth = getAuth(request);
  if (!auth) {
    return reply.status(401).send({ error: 'Not authenticated!' });
  }
  const { subscriptionId } = pushSubscriptionParamsSchema.parse(request.params);
  await deletePushSubscription(auth.user.id, subscriptionId);
  return reply.status(200).send({ success: true });
}
