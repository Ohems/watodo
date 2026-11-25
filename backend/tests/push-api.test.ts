import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// web-push is mocked so no real push request leaves the test; the VAPID keys
// are injected via a config mock so push delivery is considered configured.
vi.mock('web-push', () => ({
  sendNotification: vi.fn().mockResolvedValue({ statusCode: 201, body: '', headers: {} }),
  setVapidDetails: vi.fn(),
}));

vi.mock('../src/config.js', async importOriginal => {
  const original = await importOriginal<typeof import('../src/config.js')>();
  return {
    ...original,
    config: {
      ...original.config,
      vapidPublicKey:
        'BNUmgNFGR-ttXNJe1Bm0SQ2-17fSZ2Zt7SZIQ0Qu3-IMNNh2nTt1iEc8-PbscygX2qpC634VoAmEta8tnFEZRF8',
      vapidPrivateKey: '7X2VFQjUMg8i1GXFZLzrIlrGbzWBaTde1tddFp4CK4k',
      vapidSubject: 'mailto:test@example.com',
    },
  };
});

import { sendNotification } from 'web-push';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';
import { createNotification } from '../src/services/notification-service.js';
import { deliverPushIfEnabled } from '../src/services/push-service.js';
import { createUser, resetDatabase, type TestUser } from './helpers/fixtures.js';

// Integration tests for the web push API (VAPID key + per-user push
// subscriptions) and for push delivery from the notification service. Every
// test resets the database (beforeEach) and rebuilds the fixture, so tests are
// independent and a broken seed fails the test instead of being masked.

const sendNotificationMock = vi.mocked(sendNotification);

interface PushSubscriptionResponse {
  id: number;
  endpoint: string;
  userAgent: string | null;
  createdAt: string;
}

async function insertSubscription(
  userId: string,
  endpoint = `https://push.example.com/${randomUUID()}`,
): Promise<number> {
  const row = await db
    .insertInto('push_subscriptions')
    .values({
      user_id: userId,
      endpoint,
      p256dh: `p256dh-${randomUUID()}`,
      auth: `auth-${randomUUID()}`,
      user_agent: 'test-agent',
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  return row.id;
}

async function enablePushPreference(userId: string, messageKey: string): Promise<void> {
  await db
    .insertInto('notification_preferences')
    .values({ user_id: userId, message_key: messageKey, channel: 'push', enabled: true })
    .execute();
}

describe('Push API', () => {
  let app: FastifyInstance;
  let user: TestUser;

  const auth = (token: string) => ({ 'x-token': token });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
    sendNotificationMock.mockClear();
    user = await createUser('Push User');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/push/vapid-public-key', () => {
    it('returns the configured VAPID public key', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/push/vapid-public-key',
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { publicKey: string };
      expect(body.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/push/vapid-public-key' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/users/@me/push-subscriptions', () => {
    const payload = {
      endpoint: 'https://push.example.com/sub-1',
      keys: { p256dh: 'p256dh-key', auth: 'auth-secret' },
      userAgent: 'test-agent',
    };

    it('registers a subscription for the current user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/push-subscriptions',
        headers: auth(user.token),
        payload,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as PushSubscriptionResponse;
      expect(body.endpoint).toBe(payload.endpoint);
      expect(body.userAgent).toBe('test-agent');
      expect(body.id).toBeGreaterThan(0);

      const rows = await db.selectFrom('push_subscriptions').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(user.id);
      expect(rows[0].p256dh).toBe('p256dh-key');
      expect(rows[0].auth).toBe('auth-secret');
    });

    it('re-points an already registered endpoint at the current user', async () => {
      await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/push-subscriptions',
        headers: auth(user.token),
        payload,
      });
      const other = await createUser('Other User');
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/push-subscriptions',
        headers: auth(other.token),
        payload,
      });
      expect(response.statusCode).toBe(200);

      const rows = await db.selectFrom('push_subscriptions').selectAll().execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(other.id);

      const own = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/push-subscriptions',
        headers: auth(user.token),
      });
      expect(own.json()).toEqual([]);
    });

    it('rejects an invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/push-subscriptions',
        headers: auth(user.token),
        payload: { endpoint: 'not-a-url', keys: { p256dh: '', auth: '' } },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/push-subscriptions',
        payload,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/users/@me/push-subscriptions', () => {
    it('lists only the subscriptions of the current user', async () => {
      const ownId = await insertSubscription(user.id, 'https://push.example.com/own');
      const other = await createUser('Other User');
      await insertSubscription(other.id, 'https://push.example.com/other');

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/push-subscriptions',
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as PushSubscriptionResponse[];
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(ownId);
      expect(body[0].endpoint).toBe('https://push.example.com/own');
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/push-subscriptions',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/v1/users/@me/push-subscriptions/:subscriptionId', () => {
    it('deletes the subscription of the current user', async () => {
      const subscriptionId = await insertSubscription(user.id);
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/@me/push-subscriptions/${subscriptionId}`,
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(200);
      const rows = await db.selectFrom('push_subscriptions').selectAll().execute();
      expect(rows).toHaveLength(0);
    });

    it('returns 404 for a subscription of another user', async () => {
      const other = await createUser('Other User');
      const subscriptionId = await insertSubscription(other.id);
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/@me/push-subscriptions/${subscriptionId}`,
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for a non-numeric id', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/push-subscriptions/abc',
        headers: auth(user.token),
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/push-subscriptions/1',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('push delivery', () => {
    const params = { role: 'Room setup', eventTitle: 'Weekly Community Meeting' };

    it('does not send when the user has no push preference (push defaults to off)', async () => {
      await insertSubscription(user.id);
      await deliverPushIfEnabled(db, user.id, 'workRoleAssigned', params);
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });

    it('sends a rendered payload to every endpoint when push is enabled', async () => {
      await enablePushPreference(user.id, 'workRoleAssigned');
      await insertSubscription(user.id, 'https://push.example.com/a');
      await insertSubscription(user.id, 'https://push.example.com/b');

      await deliverPushIfEnabled(db, user.id, 'workRoleAssigned', params);

      expect(sendNotificationMock).toHaveBeenCalledTimes(2);
      const [subscription, payload] = sendNotificationMock.mock.calls[0] as unknown as [
        { endpoint: string; keys: { p256dh: string; auth: string } },
        string,
      ];
      expect(subscription.endpoint).toBe('https://push.example.com/a');
      expect(subscription.keys.p256dh).toMatch(/^p256dh-/);
      const parsed = JSON.parse(payload) as {
        title: string;
        body: string;
        icon: string;
        url: string;
      };
      // Rendered server-side in the user's language (en-GB by default).
      expect(parsed.title).toBe('You have been assigned a work role');
      expect(parsed.body).toBe('You are assigned to "Room setup" for Weekly Community Meeting.');
      expect(parsed.icon).toBe('/favicons/android-chrome-192x192.png');
      expect(parsed.url).toBe('/');
    });

    it('removes the subscription when the push service answers 410', async () => {
      await enablePushPreference(user.id, 'workRoleAssigned');
      const staleId = await insertSubscription(user.id, 'https://push.example.com/stale');
      const error = new Error('gone') as Error & { statusCode: number };
      error.statusCode = 410;
      sendNotificationMock.mockRejectedValueOnce(error);

      await deliverPushIfEnabled(db, user.id, 'workRoleAssigned', params);

      const rows = await db.selectFrom('push_subscriptions').selectAll().execute();
      expect(rows.find(row => row.id === staleId)).toBeUndefined();
    });

    it('keeps the subscription on other send errors', async () => {
      await enablePushPreference(user.id, 'workRoleAssigned');
      const subscriptionId = await insertSubscription(user.id);
      const error = new Error('network down') as Error & { statusCode: number };
      error.statusCode = 500;
      sendNotificationMock.mockRejectedValueOnce(error);

      await deliverPushIfEnabled(db, user.id, 'workRoleAssigned', params);

      const rows = await db.selectFrom('push_subscriptions').selectAll().execute();
      expect(rows.find(row => row.id === subscriptionId)).toBeDefined();
    });

    it('does not push a notification that was suppressed for the in-app channel', async () => {
      await enablePushPreference(user.id, 'workRoleAssigned');
      await db
        .insertInto('notification_preferences')
        .values({
          user_id: user.id,
          message_key: 'workRoleAssigned',
          channel: 'in_app',
          enabled: false,
        })
        .execute();
      await insertSubscription(user.id);

      const created = await createNotification(user.id, 'workRoleAssigned', params);

      expect(created).toBeNull();
      expect(sendNotificationMock).not.toHaveBeenCalled();
    });

    it('pushes when a notification row is created and push is enabled', async () => {
      await enablePushPreference(user.id, 'workRoleAssigned');
      await insertSubscription(user.id, 'https://push.example.com/live');

      const created = await createNotification(user.id, 'workRoleAssigned', params);

      expect(created).not.toBeNull();
      expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    });
  });
});
