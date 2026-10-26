import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';

// Integration test for the notifications API: seeds an organization and a user
// with one organization-linked and one personal notification, then verifies
// that notifications carry their organization (id and name) so the Home page
// can label items that aggregate content across organizations. Skipped when
// the database is not available.

interface Seed {
  organizationId: string;
  organizationName: string;
  userId: string;
  token: string;
  organizationNotificationId: number;
  personalNotificationId: number;
}

async function seed(): Promise<Seed> {
  const organizationId = randomUUID();
  const userId = randomUUID();
  const suffix = randomUUID();
  const organizationName = `Notifications Org ${suffix}`;

  await db
    .insertInto('organizations')
    .values({ id: organizationId, name: organizationName, default_timezone: 'UTC' })
    .execute();

  await db
    .insertInto('users')
    .values({ id: userId, name: 'Notified User', email: `notified-${suffix}@example.com` })
    .execute();

  const token = randomUUID();
  await db.insertInto('access_tokens').values({ user_id: userId, token }).execute();

  const organizationNotification = await db
    .insertInto('notifications')
    .values({
      user_id: userId,
      organization_id: organizationId,
      title: 'You have been assigned a job',
      body: 'You are assigned to "Room setup".',
      is_read: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const personalNotification = await db
    .insertInto('notifications')
    .values({
      user_id: userId,
      organization_id: null,
      title: 'Welcome to Watodo',
      body: 'Your account is ready.',
      is_read: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    organizationId,
    organizationName,
    userId,
    token,
    organizationNotificationId: organizationNotification.id,
    personalNotificationId: personalNotification.id,
  };
}

async function cleanup(seedData: Seed): Promise<void> {
  await db.deleteFrom('users').where('id', '=', seedData.userId).execute();
  await db.deleteFrom('organizations').where('id', '=', seedData.organizationId).execute();
}

interface NotificationResponse {
  id: number;
  organizationId: string | null;
  organizationName: string | null;
  title: string;
  isRead: boolean;
}

describe('Notifications API', () => {
  let app: FastifyInstance;
  let seedData: Seed | null = null;

  const auth = (token: string) => ({ 'x-token': token });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    try {
      seedData = await seed();
    } catch {
      seedData = null;
    }
  });

  afterAll(async () => {
    if (seedData) await cleanup(seedData).catch(() => {});
    await app.close();
  });

  describe('GET /api/v1/notifications', () => {
    it('lists notifications with their organization', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(seedData.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: NotificationResponse[] };
      const seed = seedData;
      const organizationNotification = body.items.find(
        item => item.id === seed.organizationNotificationId,
      );
      const personalNotification = body.items.find(item => item.id === seed.personalNotificationId);
      expect(organizationNotification).toBeDefined();
      expect(organizationNotification?.organizationId).toBe(seedData.organizationId);
      expect(organizationNotification?.organizationName).toBe(seedData.organizationName);
      expect(personalNotification).toBeDefined();
      expect(personalNotification?.organizationId).toBeNull();
      expect(personalNotification?.organizationName).toBeNull();
    });

    it('returns 401 without a token', async () => {
      if (!seedData) return;
      const response = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/:notificationId', () => {
    it('returns the organization when a notification is updated', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${seedData.organizationNotificationId}`,
        headers: auth(seedData.token),
        payload: { isRead: true },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as NotificationResponse;
      expect(body.isRead).toBe(true);
      expect(body.organizationId).toBe(seedData.organizationId);
      expect(body.organizationName).toBe(seedData.organizationName);
    });
  });
});
