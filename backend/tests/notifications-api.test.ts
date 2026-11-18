import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';
import { runCriticalSlotAlerts } from '../src/jobs/critical-slot-alerts.js';
import {
  addUserToOrganization,
  createCalendar,
  createOrganization,
  createUser,
  resetDatabase,
} from './helpers/fixtures.js';

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

  describe('GET /api/v1/users/@me/notification-preferences', () => {
    interface PreferencesResponse {
      channels: string[];
      preferences: { messageKey: string; channel: string; enabled: boolean; category: string }[];
    }

    it('returns every configurable message key crossed with every channel, with defaults and categories', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/notification-preferences',
        headers: auth(seedData.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as PreferencesResponse;
      expect(body.channels).toEqual(['in_app', 'email', 'push']);
      const keys = [...new Set(body.preferences.map(p => p.messageKey))];
      // All catalog keys except `welcome` (no toggle for it) are present.
      expect(keys).not.toContain('welcome');
      expect(keys).toContain('workRoleAssigned');
      expect(keys).toContain('unfilledCriticalSlot');
      expect(body.preferences).toHaveLength(keys.length * 3);
      // Defaults: only in-app is on; email and push are opt-in.
      for (const preference of body.preferences) {
        expect(preference.enabled).toBe(preference.channel === 'in_app');
        expect(['general', 'management']).toContain(preference.category);
      }
      // The management category holds exactly the manager-only alerts.
      const managementKeys = [
        ...new Set(
          body.preferences.filter(p => p.category === 'management').map(p => p.messageKey),
        ),
      ].sort();
      expect(managementKeys).toEqual(['assignmentRemovedDueToAbsence', 'unfilledCriticalSlot']);
      const generalKeys = [
        ...new Set(body.preferences.filter(p => p.category === 'general').map(p => p.messageKey)),
      ];
      expect(generalKeys).toContain('eventCancelled');
      expect(generalKeys).not.toContain('unfilledCriticalSlot');
    });

    it('reflects stored overrides', async () => {
      await db
        .insertInto('notification_preferences')
        .values({
          user_id: seedData.userId,
          message_key: 'eventCancelled',
          channel: 'email',
          enabled: false,
        })
        .execute();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/notification-preferences',
        headers: auth(seedData.token),
      });
      const body = response.json() as PreferencesResponse;
      const override = body.preferences.find(
        p => p.messageKey === 'eventCancelled' && p.channel === 'email',
      );
      expect(override?.enabled).toBe(false);
      // Other channels of the same key keep their defaults.
      const inApp = body.preferences.find(
        p => p.messageKey === 'eventCancelled' && p.channel === 'in_app',
      );
      expect(inApp?.enabled).toBe(true);
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/notification-preferences',
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/v1/users/@me/notification-preferences/:messageKey/:channel', () => {
    it('updates a preference and the list reflects it', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me/notification-preferences/workRoleAssigned/in_app',
        headers: auth(seedData.token),
        payload: { enabled: false },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        messageKey: 'workRoleAssigned',
        channel: 'in_app',
        enabled: false,
        category: 'general',
      });

      // Updating again overwrites the row instead of duplicating it.
      const again = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me/notification-preferences/workRoleAssigned/in_app',
        headers: auth(seedData.token),
        payload: { enabled: true },
      });
      expect(again.statusCode).toBe(200);
      const rows = await db
        .selectFrom('notification_preferences')
        .selectAll()
        .where('user_id', '=', seedData.userId)
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0].enabled).toBe(true);

      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/notification-preferences',
        headers: auth(seedData.token),
      });
      const body = list.json() as {
        preferences: { messageKey: string; channel: string; enabled: boolean }[];
      };
      expect(
        body.preferences.find(p => p.messageKey === 'workRoleAssigned' && p.channel === 'in_app')
          ?.enabled,
      ).toBe(true);
    });

    it('rejects an unknown channel', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me/notification-preferences/workRoleAssigned/sms',
        headers: auth(seedData.token),
        payload: { enabled: true },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects an unknown message key', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me/notification-preferences/nope/in_app',
        headers: auth(seedData.token),
        payload: { enabled: true },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects a non-boolean enabled value', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me/notification-preferences/workRoleAssigned/email',
        headers: auth(seedData.token),
        payload: { enabled: 'yes' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me/notification-preferences/workRoleAssigned/in_app',
        payload: { enabled: false },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('unfilled critical slot alerts (scheduled job)', () => {
    // Fixed reference time; the alert window is CRITICAL_SLOT_ALERT_DAYS (7) days.
    const NOW = new Date('2026-11-09T12:00:00.000Z');
    const IN_TWO_DAYS = new Date('2026-11-11T10:00:00.000Z');

    interface AlertSeed {
      organizationId: string;
      leaderId: string;
      managerId: string;
      outsiderId: string;
      seriesId: number;
      slotId: number;
    }

    /** Org with a calendar, a single-event series with one unfilled critical
     * slot in the alert window, and a connected team (leader + manager). */
    async function seedAlertFixture(options?: {
      start?: Date;
      isCritical?: boolean;
      cancelled?: boolean;
    }): Promise<AlertSeed> {
      const organizationId = await createOrganization(`Alert Org ${randomUUID()}`, {
        defaultTimezone: 'UTC',
      });
      const calendarId = await createCalendar(organizationId, 'Main Calendar');
      const leader = await createUser('Team Leader');
      const manager = await createUser('Team Manager');
      const outsider = await createUser('Outsider');
      for (const user of [leader, manager, outsider]) {
        await addUserToOrganization(user.id, organizationId);
      }
      const series = await db
        .insertInto('event_series')
        .values({
          title: 'Sunday Service',
          calendar_id: calendarId,
          start: options?.start ?? IN_TWO_DAYS,
          duration_minutes: 90,
          timezone: 'UTC',
          is_visible: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const slot = await db
        .insertInto('event_work_roles')
        .values({
          event_series_id: series.id,
          title: 'Sound desk',
          is_critical: options?.isCritical ?? true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const team = await db
        .insertInto('teams')
        .values({
          name: `Worship Team ${randomUUID()}`,
          organization_id: organizationId,
          team_leader_id: leader.id,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('team_members')
        .values({ team_id: team.id, user_id: manager.id, is_manager: true })
        .execute();
      await db
        .insertInto('event_series_teams')
        .values({ event_series_id: series.id, team_id: team.id })
        .execute();
      if (options?.cancelled) {
        await db
          .insertInto('event_occurrences')
          .values({
            event_series_id: series.id,
            occurrence_start: series.start,
            is_cancelled: true,
          })
          .execute();
      }
      return {
        organizationId,
        leaderId: leader.id,
        managerId: manager.id,
        outsiderId: outsider.id,
        seriesId: series.id,
        slotId: slot.id,
      };
    }

    it('notifies the series managers about an unfilled critical slot, once per day', async () => {
      const seed = await seedAlertFixture();

      const created = await runCriticalSlotAlerts(NOW);
      expect(created).toBe(2); // team leader + manager member

      for (const userId of [seed.leaderId, seed.managerId]) {
        const rows = await db
          .selectFrom('notifications')
          .selectAll()
          .where('user_id', '=', userId)
          .execute();
        expect(rows).toHaveLength(1);
        expect(rows[0].message_key).toBe('unfilledCriticalSlot');
        expect(rows[0].params).toEqual({
          eventTitle: 'Sunday Service',
          start: '2026-11-11T10:00:00.000Z',
          roles: 'Sound desk',
        });
        expect(rows[0].organization_id).toBe(seed.organizationId);
        expect(rows[0].dedup_key).toBe(
          `unfilledCriticalSlot:${seed.seriesId}:2026-11-11T10:00:00.000Z:2026-11-09`,
        );
      }
      // Users not managing the series get nothing.
      expect(
        await db
          .selectFrom('notifications')
          .selectAll()
          .where('user_id', '=', seed.outsiderId)
          .execute(),
      ).toHaveLength(0);

      // Re-running on the same day does not duplicate the notifications.
      expect(await runCriticalSlotAlerts(NOW)).toBe(0);
      expect(
        await db
          .selectFrom('notifications')
          .selectAll()
          .where('user_id', '=', seed.leaderId)
          .execute(),
      ).toHaveLength(1);

      // The next day the alert fires again while the slot is still unfilled.
      expect(await runCriticalSlotAlerts(new Date('2026-11-10T12:00:00.000Z'))).toBe(2);
    });

    it('does not alert when the critical slot is filled', async () => {
      const seed = await seedAlertFixture();
      const assignee = await createUser('Assignee');
      await db
        .insertInto('event_work_role_assignments')
        .values({ event_work_role_id: seed.slotId, user_id: assignee.id })
        .execute();

      expect(await runCriticalSlotAlerts(NOW)).toBe(0);
      expect(
        await db
          .selectFrom('notifications')
          .selectAll()
          .where('user_id', '=', seed.leaderId)
          .execute(),
      ).toHaveLength(0);
    });

    it('does not alert for non-critical slots, cancelled occurrences or events outside the window', async () => {
      const nonCritical = await seedAlertFixture({ isCritical: false });
      expect(await runCriticalSlotAlerts(NOW)).toBe(0);

      const cancelled = await seedAlertFixture({ cancelled: true });
      expect(await runCriticalSlotAlerts(NOW)).toBe(0);

      // 30 days out: beyond the 7-day alert window.
      await seedAlertFixture({ start: new Date('2026-12-09T10:00:00.000Z') });
      expect(await runCriticalSlotAlerts(NOW)).toBe(0);

      // No alert was created (the two seeded notifications of this test file are unrelated).
      const alerts = await db
        .selectFrom('notifications')
        .selectAll()
        .where('message_key', '=', 'unfilledCriticalSlot')
        .execute();
      expect(alerts).toHaveLength(0);
      expect(cancelled.seriesId).toBeGreaterThan(nonCritical.seriesId);
    });
  });
});
