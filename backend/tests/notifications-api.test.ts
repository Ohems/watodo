import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';
import { createOrganization, createUser, resetDatabase } from './helpers/fixtures.js';

// Integration test for the notifications API: an organization and a user
// with one organization-linked and one personal notification, verifying that
// notifications carry their organization (id and name) so the Home page can
// label items that aggregate content across organizations. Every test resets
// the database (beforeEach) and rebuilds the fixture, so tests are
// independent and a broken seed fails the test instead of being masked.

interface Seed {
  organizationId: string;
  organizationName: string;
  userId: string;
  token: string;
  organizationNotificationId: number;
  personalNotificationId: number;
}

async function seed(): Promise<Seed> {
  const suffix = randomUUID();
  const organizationName = `Notifications Org ${suffix}`;
  const organizationId = await createOrganization(organizationName, { defaultTimezone: 'UTC' });

  const user = await createUser('Notified User');

  const organizationNotification = await db
    .insertInto('notifications')
    .values({
      user_id: user.id,
      organization_id: organizationId,
      message_key: 'workRoleAssigned',
      params: { role: 'Room setup', eventTitle: 'Weekly Community Meeting' },
      is_read: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const personalNotification = await db
    .insertInto('notifications')
    .values({
      user_id: user.id,
      organization_id: null,
      message_key: 'welcome',
      params: {},
      is_read: false,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    organizationId,
    organizationName,
    userId: user.id,
    token: user.token,
    organizationNotificationId: organizationNotification.id,
    personalNotificationId: personalNotification.id,
  };
}

interface NotificationResponse {
  id: number;
  organizationId: string | null;
  organizationName: string | null;
  messageKey: string;
  params: Record<string, unknown>;
  isRead: boolean;
}

describe('Notifications API', () => {
  let app: FastifyInstance;
  let seedData: Seed;

  const auth = (token: string) => ({ 'x-token': token });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
    seedData = await seed();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/notifications', () => {
    it('lists notifications with their organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(seedData.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: NotificationResponse[] };
      const organizationNotification = body.items.find(
        item => item.id === seedData.organizationNotificationId,
      );
      const personalNotification = body.items.find(
        item => item.id === seedData.personalNotificationId,
      );
      expect(organizationNotification).toBeDefined();
      expect(organizationNotification?.organizationId).toBe(seedData.organizationId);
      expect(organizationNotification?.organizationName).toBe(seedData.organizationName);
      // The message is language-neutral: a catalog key plus params, rendered
      // client-side (or at send time for email/push) in the user's language.
      expect(organizationNotification?.messageKey).toBe('workRoleAssigned');
      expect(organizationNotification?.params).toEqual({
        role: 'Room setup',
        eventTitle: 'Weekly Community Meeting',
      });
      expect(personalNotification).toBeDefined();
      expect(personalNotification?.organizationId).toBeNull();
      expect(personalNotification?.organizationName).toBeNull();
      expect(personalNotification?.messageKey).toBe('welcome');
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/notifications' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/v1/notifications/:notificationId', () => {
    it('returns the organization when a notification is updated', async () => {
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

  describe('GET /api/v1/locales/:lng', () => {
    it('serves the notification message bundle of a supported language without auth', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/locales/fi' });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        lng: string;
        notifications: Record<string, { title: string; body: string }>;
      };
      expect(body.lng).toBe('fi');
      expect(body.notifications.workRoleAssigned.title).toBe('Sinut on määrätty työrooliin');
      expect(body.notifications.workRoleAssigned.body).toContain('{{role}}');
      expect(body.notifications.welcome.title).toBeTruthy();
    });

    it('serves the English bundles', async () => {
      for (const lng of ['en-GB', 'en-US']) {
        const response = await app.inject({ method: 'GET', url: `/api/v1/locales/${lng}` });
        expect(response.statusCode).toBe(200);
        const body = response.json() as {
          notifications: Record<string, { title: string; body: string }>;
        };
        expect(body.notifications.upcomingEvent.body).toContain('{{eventTitle}}');
      }
    });

    it('rejects an unsupported language', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/locales/de' });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Validation error');
    });
  });
});
