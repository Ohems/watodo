import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';
import {
  addUserToOrganization,
  assignRole,
  createCalendar,
  createOrganization,
  createRole,
  createUser,
  resetDatabase,
} from './helpers/fixtures.js';

// Integration test for the event series API: exercises the whole rrule based
// system end to end: series CRUD, occurrence expansion (including far into
// the future), per-occurrence cancel/reschedule, work role slots with user
// assignments, and comments. Every test resets the database (beforeEach) and
// builds its own fixture through the factories in tests/helpers/fixtures.ts,
// so tests are independent and a broken seed fails the test instead of being
// masked. The database is PGlite (in-process WebAssembly Postgres); migrations
// and permission seeding run in tests/setup.ts before each test file.

interface Seed {
  organizationId: string;
  calendarId: string;
  adminUserId: string;
  adminToken: string;
  readerUserId: string;
  readerToken: string;
  memberUserId: string;
  memberToken: string;
}

/** An organization (default timezone Europe/Berlin), a calendar, and admin,
 * reader (events:read + events:write) and plain member users. */
async function createEventsFixture(): Promise<Seed> {
  const organizationId = await createOrganization(`Events Test Org ${randomUUID()}`, {
    defaultTimezone: 'Europe/Berlin',
  });
  const calendarId = await createCalendar(organizationId, 'Main Calendar');

  const admin = await createUser('Admin User');
  const reader = await createUser('Reader User');
  const member = await createUser('Member User');
  for (const user of [admin, reader, member]) {
    await addUserToOrganization(user.id, organizationId);
  }

  const adminRole = await createRole(organizationId, 'Admin Role', ['admin']);
  await assignRole(admin.id, adminRole);
  const readerRole = await createRole(organizationId, 'Event Reader Role', [
    'events:read',
    'events:write',
  ]);
  await assignRole(reader.id, readerRole);

  return {
    organizationId,
    calendarId,
    adminUserId: admin.id,
    adminToken: admin.token,
    readerUserId: reader.id,
    readerToken: reader.token,
    memberUserId: member.id,
    memberToken: member.token,
  };
}

// Two organizations, each with one calendar and one event series, and one
// user who is an admin of both. Used by the tests that verify the organization
// filter of the list endpoints.
interface TwoOrgSeed {
  organizationAId: string;
  organizationAName: string;
  organizationBId: string;
  organizationBName: string;
  calendarAId: string;
  calendarBId: string;
  userId: string;
  token: string;
  seriesAId: number;
  seriesBId: number;
}

async function createTwoOrgFixture(): Promise<TwoOrgSeed> {
  const suffix = randomUUID();
  const organizationAName = `Org A ${suffix}`;
  const organizationBName = `Org B ${suffix}`;
  const organizationAId = await createOrganization(organizationAName, { defaultTimezone: 'UTC' });
  const organizationBId = await createOrganization(organizationBName, { defaultTimezone: 'UTC' });
  const calendarAId = await createCalendar(organizationAId, 'Calendar A');
  const calendarBId = await createCalendar(organizationBId, 'Calendar B');

  const user = await createUser('Multi Org User');
  await addUserToOrganization(user.id, organizationAId);
  await addUserToOrganization(user.id, organizationBId);
  for (const organizationId of [organizationAId, organizationBId]) {
    const role = await createRole(organizationId, 'Admin Role', ['admin']);
    await assignRole(user.id, role);
  }

  const seriesA = await db
    .insertInto('event_series')
    .values({
      title: 'Org A Event',
      calendar_id: calendarAId,
      start: new Date('2026-10-21T10:00:00.000Z'),
      duration_minutes: 60,
      timezone: 'UTC',
      is_visible: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const seriesB = await db
    .insertInto('event_series')
    .values({
      title: 'Org B Event',
      calendar_id: calendarBId,
      start: new Date('2026-10-22T10:00:00.000Z'),
      duration_minutes: 60,
      timezone: 'UTC',
      is_visible: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    organizationAId,
    organizationAName,
    organizationBId,
    organizationBName,
    calendarAId,
    calendarBId,
    userId: user.id,
    token: user.token,
    seriesAId: seriesA.id,
    seriesBId: seriesB.id,
  };
}

interface EventSeriesResponse {
  id: number;
  title: string;
  timezone: string;
  rrule: string | null;
  recurrence: { freq: string } | null;
  start: string;
  durationMinutes: number;
  siteId?: string | null;
  roomId?: string | null;
  conflicts?: BookingConflictResponse[];
}

interface OccurrenceResponse {
  seriesId: number;
  occurrenceStart: string;
  start: string;
  end: string;
  isRescheduled: boolean;
  isCancelled: boolean;
  exceptionId: number | null;
  isParticipant: boolean;
  isManager: boolean;
  workRoleSlots: {
    slotId: number;
    title: string;
    workRoleId: number | null;
    workRoleName: string | null;
    isCritical: boolean;
    assigneeCount: number;
  }[];
  managedUnfilledCriticalSlots: string[];
}

interface ExceptionResponse {
  id: number;
  occurrenceStart: string;
  isCancelled: boolean;
  overrideStart: string | null;
  overrideEnd: string | null;
  conflicts?: BookingConflictResponse[];
}

interface BookingConflictResponse {
  seriesId: number;
  title: string;
  occurrenceStart: string;
  start: string;
  end: string;
  siteId: string | null;
  roomId: string | null;
  reserveWholeSite: boolean;
}

/** Inserts a site with one room into the organization and returns both IDs. */
async function createSiteAndRoom(
  organizationId: string,
  suffix: string,
): Promise<{ siteId: string; roomId: string }> {
  const siteId = randomUUID();
  const roomId = randomUUID();
  await db
    .insertInto('sites')
    .values({ id: siteId, name: `Site ${suffix}`, organization_id: organizationId })
    .execute();
  await db
    .insertInto('rooms')
    .values({
      id: roomId,
      name: `Room ${suffix}`,
      description: '',
      site_id: siteId,
      organization_id: organizationId,
    })
    .execute();
  return { siteId, roomId };
}

interface OccurrenceWithOrganization {
  seriesId: number;
  title: string;
  organizationId: string;
  organizationName: string;
}

interface ManagementItem {
  id: number;
  title: string;
  organizationId: string;
  organizationName: string;
}

let app: FastifyInstance;

const auth = (token: string) => ({ 'x-token': token });

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await app.close();
});

const createSeries = async (
  seed: Seed,
  payload: Record<string, unknown>,
): Promise<EventSeriesResponse> => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/event-series',
    headers: auth(seed.adminToken),
    payload: { calendarId: seed.calendarId, ...payload },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as EventSeriesResponse;
};

const createWorkRole = async (
  seed: Seed,
  seriesId: number,
  payload: Record<string, unknown>,
): Promise<{ id: number; occurrenceId: number | null }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/work-roles`,
    headers: auth(seed.adminToken),
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { id: number; occurrenceId: number | null };
};

const assignToWorkRole = async (
  seed: Seed,
  seriesId: number,
  workRoleId: number,
  userId: string,
): Promise<{ id: number; userName: string }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/work-roles/${workRoleId}/assignments`,
    headers: auth(seed.adminToken),
    payload: { userId },
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { id: number; userName: string };
};

const createComment = async (
  seed: Seed,
  seriesId: number,
  payload: Record<string, unknown>,
  token = seed.adminToken,
): Promise<{ id: number; userName: string }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/comments`,
    headers: auth(token),
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { id: number; userName: string };
};

const occurrencesOf = async (
  seed: Seed,
  seriesId: number,
  start: string,
  end: string,
): Promise<OccurrenceResponse[]> => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/event-series/${seriesId}/occurrences?start=${start}&end=${end}`,
    headers: auth(seed.readerToken),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as OccurrenceResponse[];
};

const exceptionsOf = async (seed: Seed, seriesId: number): Promise<ExceptionResponse[]> => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/event-series/${seriesId}/exceptions`,
    headers: auth(seed.readerToken),
  });
  expect(response.statusCode).toBe(200);
  return response.json() as ExceptionResponse[];
};

const split = async (
  seed: Seed,
  seriesId: number,
  occurrenceStart: string,
  payload: Record<string, unknown>,
  token = seed.adminToken,
) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}/split`,
    headers: auth(token),
    payload,
  });

// Payload of the weekly Monday/Wednesday 18:00 Europe/Berlin series used by
// the occurrence, slot, comment and split tests.
const weeklyPayload = {
  title: 'Weekly sync',
  start: '2026-10-21T16:00:00.000Z', // Wednesday 18:00 Europe/Berlin
  durationMinutes: 60,
  recurrence: { freq: 'WEEKLY', byWeekdays: [1, 3] },
};

// Payload of the weekly Monday/Wednesday 10:00 UTC series used by the split
// tests.
const splitWeeklyPayload = {
  title: 'Weekly sync',
  start: '2026-10-26T10:00:00.000Z',
  durationMinutes: 60,
  timezone: 'UTC',
  recurrence: { freq: 'WEEKLY', byWeekdays: [1, 3] },
};

describe('Events API', () => {
  describe('POST /api/v1/event-series', () => {
    it('returns 403 for a member without events:write', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.memberToken),
        payload: {
          title: 'Member Series',
          calendarId: seed.calendarId,
          start: '2026-10-21T16:00:00.000Z',
        },
      });
      expect(response.statusCode).toBe(403);
    });

    it('creates a recurring series, inheriting the organization default timezone', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Weekly sync',
          description: 'Every Monday and Wednesday',
          calendarId: seed.calendarId,
          start: '2026-10-21T16:00:00.000Z', // Wednesday 18:00 Europe/Berlin
          durationMinutes: 60,
          recurrence: { freq: 'WEEKLY', byWeekdays: [1, 3] },
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.title).toBe('Weekly sync');
      expect(body.timezone).toBe('Europe/Berlin');
      expect(body.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
      expect(body.recurrence).toEqual({ freq: 'WEEKLY', byWeekdays: [1, 3] });
      expect(body.durationMinutes).toBe(60);
    });

    it('creates a series with an explicit timezone', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Daily standup',
          calendarId: seed.calendarId,
          start: '2026-01-01T09:00:00.000Z',
          durationMinutes: 30,
          timezone: 'UTC',
          recurrence: { freq: 'DAILY' },
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.timezone).toBe('UTC');
      expect(body.rrule).toBe('RRULE:FREQ=DAILY');
    });

    it('rejects an unknown timezone', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Bad tz',
          calendarId: seed.calendarId,
          start: '2026-10-21T16:00:00.000Z',
          timezone: 'Not/AZone',
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects an unknown calendar', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Bad calendar',
          calendarId: randomUUID(),
          start: '2026-10-21T16:00:00.000Z',
        },
      });
      expect(response.statusCode).toBe(404);
    });

    it('reports a booking conflict when the new series overlaps another series in the same room', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      await createSeries(seed, {
        title: 'Existing booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Overlapping booking',
          calendarId: seed.calendarId,
          start: '2026-10-21T10:30:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          roomId,
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts?.[0].title).toBe('Existing booking');
      expect(body.conflicts?.[0].start).toBe('2026-10-21T10:00:00.000Z');
      expect(body.conflicts?.[0].end).toBe('2026-10-21T11:00:00.000Z');
      expect(body.conflicts?.[0].roomId).toBe(roomId);
    });

    it('reports no conflict for the same time in a different room, and back-to-back bookings do not conflict', async () => {
      const seed = await createEventsFixture();
      const suffix = randomUUID();
      const { roomId: roomAId } = await createSiteAndRoom(seed.organizationId, `${suffix}-a`);
      const { roomId: roomBId } = await createSiteAndRoom(seed.organizationId, `${suffix}-b`);
      await createSeries(seed, {
        title: 'Room A booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId: roomAId,
      });

      // Different room, same time: no conflict.
      const otherRoom = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Room B booking',
          calendarId: seed.calendarId,
          start: '2026-10-21T10:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          roomId: roomBId,
        },
      });
      expect((otherRoom.json() as EventSeriesResponse).conflicts).toEqual([]);

      // Same room, starting exactly when the other ends: no conflict.
      const backToBack = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Back-to-back booking',
          calendarId: seed.calendarId,
          start: '2026-10-21T11:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          roomId: roomAId,
        },
      });
      expect((backToBack.json() as EventSeriesResponse).conflicts).toEqual([]);
    });

    it('reports a conflict when either side reserves the whole site', async () => {
      const seed = await createEventsFixture();
      const { siteId, roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      // Series A reserves the whole site (site only, no room).
      await createSeries(seed, {
        title: 'Whole site event',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        siteId,
        reserveWholeSite: true,
      });

      // A series targeting any room in the same site conflicts.
      const inRoom = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Room booking',
          calendarId: seed.calendarId,
          start: '2026-10-21T10:30:00.000Z',
          durationMinutes: 30,
          timezone: 'UTC',
          roomId,
        },
      });
      const inRoomBody = inRoom.json() as EventSeriesResponse;
      expect(inRoomBody.conflicts).toHaveLength(1);
      expect(inRoomBody.conflicts?.[0].reserveWholeSite).toBe(true);

      // And the reverse: a new whole-site reservation conflicts with a room booking.
      await createSeries(seed, {
        title: 'Another room booking',
        start: '2026-10-22T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });
      const reserve = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'New whole site event',
          calendarId: seed.calendarId,
          start: '2026-10-22T10:30:00.000Z',
          durationMinutes: 30,
          timezone: 'UTC',
          siteId,
          reserveWholeSite: true,
        },
      });
      const reserveBody = reserve.json() as EventSeriesResponse;
      expect(reserveBody.conflicts?.map(c => c.title)).toContain('Another room booking');
    });

    it('reports conflicts against individual occurrences of a recurring series only where they overlap', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      // Daily 10:00-11:00 in the room.
      await createSeries(seed, {
        title: 'Daily booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
        recurrence: { freq: 'DAILY' },
      });

      // One-off on a day when the daily booking exists: exactly one conflict.
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'One-off',
          calendarId: seed.calendarId,
          start: '2026-10-23T10:30:00.000Z',
          durationMinutes: 30,
          timezone: 'UTC',
          roomId,
        },
      });
      const body = response.json() as EventSeriesResponse;
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts?.[0].occurrenceStart).toBe('2026-10-23T10:00:00.000Z');
    });

    it('caps the reported conflicts for identical open-ended recurrences instead of looping forever', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      await createSeries(seed, {
        title: 'Daily forever',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
        recurrence: { freq: 'DAILY' },
      });

      // Same time, same room, same open-ended recurrence: every occurrence
      // overlaps. The 10-year expansion window yields ~3700 overlapping
      // occurrences; the response must stay capped and the request finite.
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Daily forever copy',
          calendarId: seed.calendarId,
          start: '2026-10-21T10:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          roomId,
          recurrence: { freq: 'DAILY' },
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.conflicts).toHaveLength(100);
      expect(body.conflicts?.[0].title).toBe('Daily forever');
      expect(body.conflicts?.[0].occurrenceStart).toBe('2026-10-21T10:00:00.000Z');
      // All entries are deduplicated occurrences of the one existing series.
      const keys = new Set(body.conflicts?.map(c => `${c.seriesId}:${c.occurrenceStart}`));
      expect(keys.size).toBe(100);
    });

    it('does not report conflicts across organizations', async () => {
      const seed = await createEventsFixture();
      const otherOrgId = await createOrganization(`Other Org ${randomUUID()}`, {
        defaultTimezone: 'UTC',
      });
      const otherCalendarId = await createCalendar(otherOrgId, 'Other Calendar');
      const { roomId: roomAId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      const { siteId: otherSiteId, roomId: otherRoomId } = await createSiteAndRoom(
        otherOrgId,
        randomUUID(),
      );
      await createSeries(seed, {
        title: 'Org A booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId: roomAId,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title: 'Org B booking',
          calendarId: otherCalendarId,
          start: '2026-10-21T10:30:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          siteId: otherSiteId,
          roomId: otherRoomId,
        },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as EventSeriesResponse).conflicts).toEqual([]);
    });
  });

  describe('GET /api/v1/event-series', () => {
    it('returns 401 without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/event-series' });
      expect(response.statusCode).toBe(401);
    });

    it('returns 403 for a member without events:read', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series',
        headers: auth(seed.memberToken),
      });
      expect(response.statusCode).toBe(403);
    });

    it('lists series', async () => {
      const seed = await createEventsFixture();
      await createSeries(seed, weeklyPayload);
      await createSeries(seed, {
        title: 'Daily standup',
        start: '2026-01-01T09:00:00.000Z',
        durationMinutes: 30,
        timezone: 'UTC',
        recurrence: { freq: 'DAILY' },
      });
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series?organizationId=${seed.organizationId}`,
        headers: auth(seed.adminToken),
      });
      expect(list.statusCode).toBe(200);
      expect((list.json() as EventSeriesResponse[]).length).toBe(2);
    });

    it('restricts the series list to one organization when organizationId is given', async () => {
      const twoOrg = await createTwoOrgFixture();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series?organizationId=${twoOrg.organizationAId}`,
        headers: auth(twoOrg.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as Array<{ id: number; calendarId: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(twoOrg.seriesAId);
      expect(body[0].calendarId).toBe(twoOrg.calendarAId);
    });

    it('requires organizationId on the series list', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/event-series/:seriesId', () => {
    it('reads a series', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
      });
      expect(detail.statusCode).toBe(200);
      expect((detail.json() as EventSeriesResponse).id).toBe(series.id);
    });
  });

  describe('GET /api/v1/event-series/occurrences', () => {
    // The occurrences endpoint is the one exception to the required
    // organization filter: the Home page aggregates the events of all
    // organizations.
    it('lists occurrences of all organizations, each with its organization', async () => {
      const twoOrg = await createTwoOrgFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-10-23T00:00:00.000Z',
        headers: auth(twoOrg.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as OccurrenceWithOrganization[];
      const eventA = body.filter(o => o.seriesId === twoOrg.seriesAId);
      const eventB = body.filter(o => o.seriesId === twoOrg.seriesBId);
      expect(eventA).toHaveLength(1);
      expect(eventB).toHaveLength(1);
      expect(eventA[0].organizationId).toBe(twoOrg.organizationAId);
      expect(eventA[0].organizationName).toBe(twoOrg.organizationAName);
      expect(eventB[0].organizationId).toBe(twoOrg.organizationBId);
      expect(eventB[0].organizationName).toBe(twoOrg.organizationBName);
    });

    it('restricts occurrences to one organization when organizationId is given', async () => {
      const twoOrg = await createTwoOrgFixture();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-10-23T00:00:00.000Z&organizationId=${twoOrg.organizationAId}`,
        headers: auth(twoOrg.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as OccurrenceWithOrganization[];
      expect(body).toHaveLength(1);
      expect(body[0].seriesId).toBe(twoOrg.seriesAId);
      expect(body[0].organizationId).toBe(twoOrg.organizationAId);
    });

    it('expands occurrences of all series in a range with DST-correct instants', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z',
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as OccurrenceResponse[];
      const weekly = body.filter(o => o.seriesId === series.id);
      expect(weekly.map(o => o.start)).toEqual([
        '2026-10-21T16:00:00.000Z',
        '2026-10-26T17:00:00.000Z',
        '2026-10-28T17:00:00.000Z',
        '2026-11-02T17:00:00.000Z',
        '2026-11-04T17:00:00.000Z',
      ]);
      expect(weekly[0].end).toBe('2026-10-21T17:00:00.000Z');
    });

    it('expands a daily series 10 years into the future', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, {
        title: 'Daily standup',
        start: '2026-01-01T09:00:00.000Z',
        durationMinutes: 30,
        timezone: 'UTC',
        recurrence: { freq: 'DAILY' },
      });
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/occurrences?start=2036-06-01T00:00:00.000Z&end=2036-07-01T00:00:00.000Z',
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as OccurrenceResponse[];
      // The daily standup series (UTC) has 30 occurrences in June 2036.
      const daily = body.filter(o => o.seriesId === series.id);
      expect(daily).toHaveLength(30);
      expect(daily[0].start).toBe('2036-06-01T09:00:00.000Z');
      expect(daily[29].start).toBe('2036-06-30T09:00:00.000Z');
    });

    it('rejects occurrence ranges over 10 years', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/occurrences?start=2026-01-01T00:00:00.000Z&end=2040-01-01T00:00:00.000Z',
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(400);
    });

    it('filters occurrences by site, room, team and scope', async () => {
      const seed = await createEventsFixture();
      const suffix = randomUUID();
      const calendarId = randomUUID();
      await db
        .insertInto('calendars')
        .values({
          id: calendarId,
          name: `Filter Calendar ${suffix}`,
          organization_id: seed.organizationId,
        })
        .execute();

      // Create two sites, each with one room.
      const siteAId = randomUUID();
      const siteBId = randomUUID();
      await db
        .insertInto('sites')
        .values([
          {
            id: siteAId,
            name: `Site A ${suffix}`,
            organization_id: seed.organizationId,
          },
          {
            id: siteBId,
            name: `Site B ${suffix}`,
            organization_id: seed.organizationId,
          },
        ])
        .execute();

      const roomAId = randomUUID();
      const roomBId = randomUUID();
      await db
        .insertInto('rooms')
        .values([
          {
            id: roomAId,
            name: `Room A ${suffix}`,
            description: '',
            site_id: siteAId,
            organization_id: seed.organizationId,
          },
          {
            id: roomBId,
            name: `Room B ${suffix}`,
            description: '',
            site_id: siteBId,
            organization_id: seed.organizationId,
          },
        ])
        .execute();

      const teamAId = randomUUID();
      const teamBId = randomUUID();
      await db
        .insertInto('teams')
        .values([
          {
            id: teamAId,
            name: `Team A ${suffix}`,
            description: '',
            organization_id: seed.organizationId,
          },
          {
            id: teamBId,
            name: `Team B ${suffix}`,
            description: '',
            organization_id: seed.organizationId,
          },
        ])
        .execute();

      // The reader user belongs to team A only.
      await db
        .insertInto('team_members')
        .values({ team_id: teamAId, user_id: seed.readerUserId })
        .execute();

      // Series A: site A + room A, team A. Series B: site B + room B, team B.
      // Series C: site A only (no room), no team.
      const seriesAId = (
        await createSeries(seed, {
          title: `Filter series A ${suffix}`,
          calendarId,
          start: '2026-10-21T16:00:00.000Z', // Wednesday 16:00 UTC
          durationMinutes: 60,
          timezone: 'UTC',
          recurrence: { freq: 'WEEKLY', byWeekdays: [3] },
        })
      ).id;
      const seriesBId = (
        await createSeries(seed, {
          title: `Filter series B ${suffix}`,
          calendarId,
          start: '2026-10-21T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          recurrence: { freq: 'WEEKLY', byWeekdays: [3] },
        })
      ).id;
      const seriesCId = (
        await createSeries(seed, {
          title: `Filter series C ${suffix}`,
          calendarId,
          start: '2026-10-21T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
          recurrence: { freq: 'WEEKLY', byWeekdays: [3] },
        })
      ).id;
      const mySeriesIds = [seriesAId, seriesBId, seriesCId];

      const configure = async (
        id: number,
        config: { siteId?: string; roomId?: string; teamIds: string[] },
      ) => {
        const response = await app.inject({
          method: 'PATCH',
          url: `/api/v1/event-series/${id}/config`,
          headers: auth(seed.adminToken),
          payload: config,
        });
        expect(response.statusCode).toBe(200);
      };
      await configure(seriesAId, { siteId: siteAId, roomId: roomAId, teamIds: [teamAId] });
      await configure(seriesBId, { siteId: siteBId, roomId: roomBId, teamIds: [teamBId] });
      await configure(seriesCId, { siteId: siteAId, teamIds: [] });

      // The reader is assigned to a series-wide slot on series A (covering all
      // its occurrences) and to an occurrence-scoped slot on series C.
      const slotA = await createWorkRole(seed, seriesAId, { title: 'Series-wide slot' });
      await assignToWorkRole(seed, seriesAId, slotA.id, seed.readerUserId);

      const slotC = await createWorkRole(seed, seriesCId, {
        title: 'Scoped slot',
        occurrenceStart: '2026-10-28T16:00:00.000Z',
      });
      await assignToWorkRole(seed, seriesCId, slotC.id, seed.readerUserId);

      const range = 'start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z';
      const getOccurrences = async (token: string, query = '') => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/event-series/occurrences?${range}${query}`,
          headers: auth(token),
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as OccurrenceResponse[]).filter(o =>
          mySeriesIds.includes(o.seriesId),
        );
      };
      const seriesIdsOf = (occurrences: OccurrenceResponse[]) =>
        [...new Set(occurrences.map(o => o.seriesId))].sort((a, b) => a - b);

      // Baseline: all three series show up (three Wednesdays each).
      const all = await getOccurrences(seed.readerToken);
      expect(seriesIdsOf(all)).toEqual(mySeriesIds);
      expect(all).toHaveLength(9);

      // Site filter.
      const bySite = await getOccurrences(seed.readerToken, `&siteId=${siteAId}`);
      expect(seriesIdsOf(bySite)).toEqual([seriesAId, seriesCId]);

      // Room filter.
      const byRoom = await getOccurrences(seed.readerToken, `&roomId=${roomAId}`);
      expect(seriesIdsOf(byRoom)).toEqual([seriesAId]);

      // Team filter.
      const byTeam = await getOccurrences(seed.readerToken, `&teamId=${teamAId}`);
      expect(seriesIdsOf(byTeam)).toEqual([seriesAId]);

      // Combined site + team filter.
      const combined = await getOccurrences(
        seed.readerToken,
        `&siteId=${siteAId}&teamId=${teamAId}`,
      );
      expect(seriesIdsOf(combined)).toEqual([seriesAId]);

      // Scope "my team's events": only series linked to a team of the reader.
      const teamScope = await getOccurrences(seed.readerToken, '&scope=team');
      expect(seriesIdsOf(teamScope)).toEqual([seriesAId]);

      // Scope "my events": all occurrences of series A (series-wide slot) and
      // only the 2026-10-28 occurrence of series C (occurrence-scoped slot).
      const mine = await getOccurrences(seed.readerToken, '&scope=mine');
      expect(seriesIdsOf(mine)).toEqual([seriesAId, seriesCId]);
      const mineBySeries = new Map<number, string[]>();
      for (const occurrence of mine) {
        const starts = mineBySeries.get(occurrence.seriesId) ?? [];
        starts.push(occurrence.occurrenceStart);
        mineBySeries.set(occurrence.seriesId, starts);
      }
      expect(mineBySeries.get(seriesAId)).toHaveLength(3);
      expect(mineBySeries.get(seriesCId)).toEqual(['2026-10-28T16:00:00.000Z']);

      // The admin has no slot assignments, so "my events" is empty for them.
      const adminMine = await getOccurrences(seed.adminToken, '&scope=mine');
      expect(adminMine).toHaveLength(0);
    });

    it('supports the involved scope with participant/manager flags and slot status', async () => {
      const seed = await createEventsFixture();
      const suffix = randomUUID();

      // Series A: connected to a team the reader manages; has a critical
      // slot linked to the team's work role with no assignee.
      // Series B: the reader is assigned to a slot (participant).
      // Series C: no connection to the reader at all.
      const seriesAId = (
        await createSeries(seed, {
          title: `Involved A ${suffix}`,
          start: '2026-10-21T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
        })
      ).id;
      const seriesBId = (
        await createSeries(seed, {
          title: `Involved B ${suffix}`,
          start: '2026-10-22T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
        })
      ).id;
      const seriesCId = (
        await createSeries(seed, {
          title: `Involved C ${suffix}`,
          start: '2026-10-23T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
        })
      ).id;
      const mySeriesIds = [seriesAId, seriesBId, seriesCId];

      const workRoleId = (
        await db
          .insertInto('work_roles')
          .values({ name: `Cook ${suffix}`, organization_id: seed.organizationId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      const teamId = (
        await db
          .insertInto('teams')
          .values({
            name: `Managed Team ${suffix}`,
            description: '',
            organization_id: seed.organizationId,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      // The reader is a manager member of the team; the team is connected to
      // series A and assigned the work role.
      await db
        .insertInto('team_members')
        .values({ team_id: teamId, user_id: seed.readerUserId, is_manager: true })
        .execute();
      await db
        .insertInto('team_work_roles')
        .values({ team_id: teamId, work_role_id: workRoleId })
        .execute();
      await db
        .insertInto('event_series_teams')
        .values({ event_series_id: seriesAId, team_id: teamId })
        .execute();

      // Series A: critical slot linked to the team's work role, unfilled; plus
      // a filled non-critical slot.
      const criticalSlot = await createWorkRole(seed, seriesAId, {
        title: 'Critical cook',
        isCritical: true,
        workRoleId,
      });
      const filledSlot = await createWorkRole(seed, seriesAId, {
        title: 'Helper',
        isCritical: false,
      });
      await assignToWorkRole(seed, seriesAId, filledSlot.id, seed.memberUserId);

      // Series B: the reader is assigned to a slot (participant).
      const slotB = await createWorkRole(seed, seriesBId, { title: 'Reader slot' });
      await assignToWorkRole(seed, seriesBId, slotB.id, seed.readerUserId);

      const range = 'start=2026-10-21T00:00:00.000Z&end=2026-10-25T00:00:00.000Z';
      const getOccurrences = async (token: string, query = '') => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/v1/event-series/occurrences?${range}${query}`,
          headers: auth(token),
        });
        expect(response.statusCode).toBe(200);
        return (response.json() as OccurrenceResponse[]).filter(o =>
          mySeriesIds.includes(o.seriesId),
        );
      };

      // Scope "involved": series A (manager via team) and series B
      // (participant); series C is excluded.
      const involved = await getOccurrences(seed.readerToken, '&scope=involved');
      expect([...new Set(involved.map(o => o.seriesId))].sort((a, b) => a - b)).toEqual([
        seriesAId,
        seriesBId,
      ]);

      const occA = involved.find(o => o.seriesId === seriesAId);
      expect(occA?.isManager).toBe(true);
      expect(occA?.isParticipant).toBe(false);
      // Slot status indicators include both slots with their assignee counts.
      expect(occA?.workRoleSlots).toHaveLength(2);
      const critical = occA?.workRoleSlots.find(s => s.slotId === criticalSlot.id);
      expect(critical?.isCritical).toBe(true);
      expect(critical?.assigneeCount).toBe(0);
      expect(critical?.workRoleId).toBe(workRoleId);
      expect(critical?.workRoleName).toBe(`Cook ${suffix}`);
      const helper = occA?.workRoleSlots.find(s => s.slotId === filledSlot.id);
      expect(helper?.assigneeCount).toBe(1);
      // The unfilled critical slot of the managed work role is flagged.
      expect(occA?.managedUnfilledCriticalSlots).toEqual(['Critical cook']);

      const occB = involved.find(o => o.seriesId === seriesBId);
      expect(occB?.isParticipant).toBe(true);
      expect(occB?.isManager).toBe(false);
      expect(occB?.managedUnfilledCriticalSlots).toEqual([]);
      expect(occB?.workRoleSlots[0]?.assigneeCount).toBe(1);

      // The member (events:read only) is a participant of series A (assigned
      // to the helper slot) but not a manager of anything.
      const memberRole = await createRole(seed.organizationId, 'Involved Member Role', [
        'events:read',
      ]);
      await assignRole(seed.memberUserId, memberRole);
      const memberInvolved = await getOccurrences(seed.memberToken, '&scope=involved');
      expect(memberInvolved.map(o => o.seriesId)).toEqual([seriesAId]);
      expect(memberInvolved[0]?.isParticipant).toBe(true);
      expect(memberInvolved[0]?.isManager).toBe(false);
      expect(memberInvolved[0]?.managedUnfilledCriticalSlots).toEqual([]);

      // Without a scope, all three series are listed and the flags are set.
      const all = await getOccurrences(seed.readerToken);
      expect(all).toHaveLength(3);
      expect(all.find(o => o.seriesId === seriesCId)?.isManager).toBe(false);
      expect(all.find(o => o.seriesId === seriesCId)?.isParticipant).toBe(false);
      expect(all.find(o => o.seriesId === seriesCId)?.workRoleSlots).toEqual([]);

      // A team leader (not a manager member) also counts as manager.
      await db
        .updateTable('team_members')
        .set({ is_manager: false })
        .where('team_id', '=', teamId)
        .execute();
      await db
        .updateTable('teams')
        .set({ team_leader_id: seed.readerUserId })
        .where('id', '=', teamId)
        .execute();
      const leaderInvolved = await getOccurrences(seed.readerToken, '&scope=involved');
      const leaderOccA = leaderInvolved.find(o => o.seriesId === seriesAId);
      expect(leaderOccA?.isManager).toBe(true);
      expect(leaderOccA?.managedUnfilledCriticalSlots).toEqual(['Critical cook']);
    });
  });

  describe('GET /api/v1/organizations/:organizationId/users/:userId/event-assignments', () => {
    it('lists the occurrences the target user is assigned to, with roles, paginated and date-filtered', async () => {
      const seed = await createEventsFixture();
      const suffix = randomUUID();

      const workRoleId = (
        await db
          .insertInto('work_roles')
          .values({ name: `Cook ${suffix}`, organization_id: seed.organizationId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;

      // Series A: single event in range, critical slot linked to a work role,
      // assigned to the reader.
      const seriesAId = (
        await createSeries(seed, {
          title: `Assignments A ${suffix}`,
          start: '2027-10-21T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
        })
      ).id;
      const slotA = await createWorkRole(seed, seriesAId, {
        title: 'Cook the meal',
        isCritical: true,
        workRoleId,
      });
      await assignToWorkRole(seed, seriesAId, slotA.id, seed.readerUserId);

      // Series B: single event in range, assigned to the member only.
      const seriesBId = (
        await createSeries(seed, {
          title: `Assignments B ${suffix}`,
          start: '2026-10-22T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
        })
      ).id;
      const slotB = await createWorkRole(seed, seriesBId, { title: 'Member slot' });
      await assignToWorkRole(seed, seriesBId, slotB.id, seed.memberUserId);

      // Series C: weekly recurring in range, series-wide slot assigned to the
      // reader (3 occurrences in the range).
      const seriesCId = (
        await createSeries(seed, {
          title: `Assignments C ${suffix}`,
          start: '2027-10-20T16:00:00.000Z', // Wednesday
          durationMinutes: 60,
          timezone: 'UTC',
          recurrence: { freq: 'WEEKLY', byWeekdays: [3] },
        })
      ).id;
      const slotC = await createWorkRole(seed, seriesCId, { title: 'Weekly helper' });
      await assignToWorkRole(seed, seriesCId, slotC.id, seed.readerUserId);

      // Series D: single event three months after the range, assigned to the
      // reader (only visible when the date span is extended explicitly).
      const seriesDId = (
        await createSeries(seed, {
          title: `Assignments D ${suffix}`,
          start: '2028-01-15T16:00:00.000Z',
          durationMinutes: 60,
          timezone: 'UTC',
        })
      ).id;
      const slotD = await createWorkRole(seed, seriesDId, { title: 'Far future slot' });
      await assignToWorkRole(seed, seriesDId, slotD.id, seed.readerUserId);

      const baseUrl = `/api/v1/organizations/${seed.organizationId}/users/${seed.readerUserId}/event-assignments`;
      const getAssignments = async (token: string, query = '') => {
        const response = await app.inject({
          method: 'GET',
          url: `${baseUrl}?${query}`,
          headers: auth(token),
        });
        return response;
      };

      // In range: series A (1) + series C (3) = 4 assignments; series B and D excluded.
      const range = 'start=2027-10-20T00:00:00.000Z&end=2027-11-05T00:00:00.000Z';
      const page0 = await getAssignments(seed.adminToken, `${range}&page=0&limit=2`);
      expect(page0.statusCode).toBe(200);
      const body0 = page0.json() as {
        items: {
          seriesId: number;
          title: string;
          start: string;
          roles: { title: string; workRoleName: string | null; isCritical: boolean }[];
        }[];
        total: number;
        page: number;
        limit: number;
      };
      expect(body0.total).toBe(4);
      expect(body0.page).toBe(0);
      expect(body0.limit).toBe(2);
      expect(body0.items).toHaveLength(2);
      // Sorted by start: series C (Oct 20) first, then series A (Oct 21).
      expect(body0.items[0].seriesId).toBe(seriesCId);
      expect(body0.items[0].roles[0].title).toBe('Weekly helper');
      const firstA = body0.items.find(i => i.seriesId === seriesAId);
      expect(firstA).toBeDefined();
      expect(firstA?.roles).toHaveLength(1);
      expect(firstA?.roles[0]).toMatchObject({
        title: 'Cook the meal',
        workRoleId,
        workRoleName: `Cook ${suffix}`,
        isCritical: true,
      });

      // Page 1 returns the remaining two occurrences of series C.
      const page1 = await getAssignments(seed.adminToken, `${range}&page=1&limit=2`);
      const body1 = page1.json() as typeof body0;
      expect(body1.items).toHaveLength(2);
      expect(body1.items.every(i => i.seriesId === seriesCId)).toBe(true);

      // Default span (no start/end): one month back and forward from now, so
      // the 2026 fixtures are excluded and the result is empty.
      const defaultSpan = await getAssignments(seed.adminToken);
      expect(defaultSpan.statusCode).toBe(200);
      expect((defaultSpan.json() as typeof body0).total).toBe(0);

      // Extending the span explicitly includes series D.
      const wide = await getAssignments(
        seed.adminToken,
        'start=2027-10-20T00:00:00.000Z&end=2028-02-01T00:00:00.000Z&limit=200',
      );
      const wideBody = wide.json() as typeof body0;
      expect(wideBody.total).toBeGreaterThan(4);
      expect(wideBody.items.some(i => i.seriesId === seriesDId)).toBe(true);

      // The member has no events:read permission.
      const forbidden = await getAssignments(seed.memberToken, range);
      expect(forbidden.statusCode).toBe(403);

      // A user outside the organization is rejected.
      const outsider = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seed.organizationId}/users/${randomUUID()}/event-assignments?${range}`,
        headers: auth(seed.adminToken),
      });
      expect(outsider.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/cancel', () => {
    it('cancels an occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const occurrenceStart = encodeURIComponent('2026-10-28T17:00:00.000Z');
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}/cancel`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as ExceptionResponse;
      expect(body.isCancelled).toBe(true);
      expect(body.occurrenceStart).toBe('2026-10-28T17:00:00.000Z');

      // The occurrence no longer shows up in range expansion...
      const occurrences = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z',
        headers: auth(seed.readerToken),
      });
      const weekly = (occurrences.json() as OccurrenceResponse[]).filter(
        o => o.seriesId === series.id,
      );
      expect(weekly.map(o => o.start)).toEqual([
        '2026-10-21T16:00:00.000Z',
        '2026-10-26T17:00:00.000Z',
        '2026-11-02T17:00:00.000Z',
        '2026-11-04T17:00:00.000Z',
      ]);

      // ...but the occurrence detail still shows it as cancelled.
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}`,
        headers: auth(seed.readerToken),
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().occurrence.isCancelled).toBe(true);
    });

    it('rejects cancelling a date that is not an occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-10-22T16:00:00.000Z')}/cancel`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/reschedule', () => {
    it('reschedules an occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const occurrenceStart = encodeURIComponent('2026-11-02T17:00:00.000Z');
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}/reschedule`,
        headers: auth(seed.adminToken),
        payload: { start: '2026-11-03T10:00:00.000Z' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as ExceptionResponse;
      expect(body.isCancelled).toBe(false);
      expect(body.overrideStart).toBe('2026-11-03T10:00:00.000Z');
      // End defaults to start + series duration.
      expect(body.overrideEnd).toBe('2026-11-03T11:00:00.000Z');

      const occurrences = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z',
        headers: auth(seed.readerToken),
      });
      const weekly = (occurrences.json() as OccurrenceResponse[]).filter(
        o => o.seriesId === series.id,
      );
      const moved = weekly.find(o => o.occurrenceStart === '2026-11-02T17:00:00.000Z');
      expect(moved).toBeDefined();
      expect(moved?.start).toBe('2026-11-03T10:00:00.000Z');
      expect(moved?.isRescheduled).toBe(true);
      expect(weekly.some(o => o.start === '2026-11-02T17:00:00.000Z')).toBe(false);
    });

    it('reports booking conflicts when the occurrence is rescheduled into another booking in the same room', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      const series = await createSeries(seed, {
        ...weeklyPayload,
        timezone: 'UTC',
        start: '2026-10-21T10:00:00.000Z',
        roomId,
      });
      await createSeries(seed, {
        title: 'Other booking',
        start: '2026-11-03T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });

      // 2026-11-02T10:00:00Z is a Monday occurrence of the weekly series.
      const occurrenceStart = encodeURIComponent('2026-11-02T10:00:00.000Z');
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}/reschedule`,
        headers: auth(seed.adminToken),
        payload: { start: '2026-11-03T10:30:00.000Z' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as ExceptionResponse;
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts?.[0].title).toBe('Other booking');
      expect(body.conflicts?.[0].start).toBe('2026-11-03T10:00:00.000Z');
    });

    it('reports a conflict with another occurrence of the same series when rescheduled onto it, but not with cancelled occurrences of other series', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      const series = await createSeries(seed, {
        ...weeklyPayload,
        timezone: 'UTC',
        start: '2026-10-21T10:00:00.000Z', // Wednesday
        roomId,
      });
      const other = await createSeries(seed, {
        title: 'Cancelled other',
        start: '2026-11-05T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });
      // Cancel the other series' only occurrence.
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${other.id}/occurrences/${encodeURIComponent('2026-11-05T10:00:00.000Z')}/cancel`,
        headers: auth(seed.adminToken),
      });

      // Reschedule the Wednesday 2026-11-04 occurrence onto Monday 2026-11-02T10:00
      // (another occurrence of the same series): conflict with the same series.
      const ontoSelf = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-11-04T10:00:00.000Z')}/reschedule`,
        headers: auth(seed.adminToken),
        payload: { start: '2026-11-02T10:00:00.000Z' },
      });
      expect(ontoSelf.statusCode).toBe(200);
      const selfBody = ontoSelf.json() as ExceptionResponse;
      expect(selfBody.conflicts).toHaveLength(1);
      expect(selfBody.conflicts?.[0].seriesId).toBe(series.id);
      expect(selfBody.conflicts?.[0].occurrenceStart).toBe('2026-11-02T10:00:00.000Z');

      // Rescheduling onto the cancelled occurrence of the other series: no conflict.
      const ontoCancelled = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-11-04T10:00:00.000Z')}/reschedule`,
        headers: auth(seed.adminToken),
        payload: { start: '2026-11-05T10:00:00.000Z' },
      });
      expect((ontoCancelled.json() as ExceptionResponse).conflicts).toEqual([]);
    });
  });

  describe('POST /api/v1/event-occurrences/:occurrenceRef/materialize', () => {
    it('returns the stable ID and the booking conflicts of the occurrence', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      const series = await createSeries(seed, {
        ...weeklyPayload,
        timezone: 'UTC',
        start: '2026-10-21T10:00:00.000Z',
        roomId,
      });
      await createSeries(seed, {
        title: 'Other booking',
        start: '2026-10-21T10:30:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });

      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T10:00:00.000Z`);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        occurrenceId: number;
        conflicts: BookingConflictResponse[];
      };
      expect(typeof body.occurrenceId).toBe('number');
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0].title).toBe('Other booking');
    });

    it('reports no conflicts for an occurrence without overlapping bookings', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      const series = await createSeries(seed, {
        ...weeklyPayload,
        timezone: 'UTC',
        start: '2026-10-21T10:00:00.000Z',
        roomId,
      });

      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-28T10:00:00.000Z`);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        occurrenceId: number;
        conflicts: BookingConflictResponse[];
      };
      expect(body.conflicts).toEqual([]);
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/exception', () => {
    it('restores an occurrence when its exception is deleted', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const occurrenceStart = encodeURIComponent('2026-10-28T17:00:00.000Z');

      // Cancel the occurrence first so an exception exists to delete.
      const cancel = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}/cancel`,
        headers: auth(seed.adminToken),
      });
      expect(cancel.statusCode).toBe(200);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}/exception`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);

      const occurrences = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z`,
        headers: auth(seed.readerToken),
      });
      const starts = (occurrences.json() as OccurrenceResponse[]).map(o => o.start);
      expect(starts).toContain('2026-10-28T17:00:00.000Z');
    });
  });

  describe('POST /api/v1/event-series/:seriesId/work-roles', () => {
    it('creates series-wide and occurrence-scoped work role slots', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);

      // Series-wide slot.
      const slot = await createWorkRole(seed, series.id, {
        title: 'Setup crew',
        description: 'Arrive early',
      });
      expect(slot.occurrenceId).toBeNull();

      // Occurrence-scoped slot: points at the materialized occurrence.
      const scoped = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      expect(scoped.occurrenceId).not.toBeNull();
      const occRow = await db
        .selectFrom('event_occurrences')
        .select('occurrence_start')
        .where('id', '=', scoped.occurrenceId as number)
        .executeTakeFirstOrThrow();
      expect(occRow.occurrence_start.toISOString()).toBe('2026-10-21T16:00:00.000Z');
    });

    it('rejects a work role slot for a date that is not an occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/work-roles`,
        headers: auth(seed.adminToken),
        payload: { title: 'Nope', occurrenceStart: '2026-10-22T16:00:00.000Z' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('inherits the description from a linked work role of the same organization', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const workRoleId = (
        await db
          .insertInto('work_roles')
          .values({
            name: 'Kitchen Helper',
            description: 'Help prepare and serve food.',
            organization_id: seed.organizationId,
          })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/work-roles`,
        headers: auth(seed.adminToken),
        payload: { title: 'Kitchen Helper', workRoleId },
      });
      expect(response.statusCode).toBe(200);
      const slot = response.json() as { description: string; workRoleName: string | null };
      expect(slot.description).toBe('Help prepare and serve food.');
      expect(slot.workRoleName).toBe('Kitchen Helper');
    });

    it('rejects a work role from another organization', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const otherOrgId = await createOrganization(`Other Org ${randomUUID()}`, {
        defaultTimezone: 'UTC',
      });
      const otherWorkRoleId = (
        await db
          .insertInto('work_roles')
          .values({ name: 'Other Org Role', organization_id: otherOrgId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/work-roles`,
        headers: auth(seed.adminToken),
        payload: { title: 'Cross-org slot', workRoleId: otherWorkRoleId },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/work-roles/:workRoleId/assignments', () => {
    it('assigns a user to a work role slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      const assignment = await assignToWorkRole(seed, series.id, slot.id, seed.readerUserId);
      expect(assignment.userName).toBe('Reader User');
    });

    it('rejects a duplicate assignment', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      await assignToWorkRole(seed, series.id, slot.id, seed.readerUserId);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: seed.readerUserId },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects an assignment for an unknown user', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: randomUUID() },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/event-series/:seriesId/work-roles/:workRoleId/assignment-candidates', () => {
    interface CandidateItem {
      id: string;
      name: string;
      hasAbsence: boolean;
      hasWorkRole: boolean;
      isQualified: boolean;
      missingCertifications: {
        certificationId: number;
        name: string;
        expiredDate: string | null;
      }[];
    }

    /** Builds a series with a slot linked to a work role that requires one certification. */
    async function createSlotWithWorkRole(seed: Seed) {
      const suffix = randomUUID();
      const series = await createSeries(seed, weeklyPayload);
      const workRoleId = (
        await db
          .insertInto('work_roles')
          .values({ name: `Cook ${suffix}`, organization_id: seed.organizationId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      const certificationId = (
        await db
          .insertInto('certifications')
          .values({ name: `Food Safety ${suffix}`, organization_id: seed.organizationId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      await db
        .insertInto('certification_work_roles')
        .values({ work_role_id: workRoleId, certification_id: certificationId })
        .execute();
      const slot = await createWorkRole(seed, series.id, {
        title: 'Cook',
        workRoleId,
        isCritical: true,
      });
      return { series, workRoleId, certificationId, slot };
    }

    const candidatesOf = async (
      seed: Seed,
      seriesId: number,
      slotId: number,
      query = '',
      token = seed.readerToken,
    ): Promise<CandidateItem[]> => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${seriesId}/work-roles/${slotId}/assignment-candidates${query}`,
        headers: auth(token),
      });
      expect(response.statusCode).toBe(200);
      return response.json() as CandidateItem[];
    };

    it('returns 403 for a member without events:read', async () => {
      const seed = await createEventsFixture();
      const { series, slot } = await createSlotWithWorkRole(seed);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}/assignment-candidates`,
        headers: auth(seed.memberToken),
      });
      expect(response.statusCode).toBe(403);
    });

    it('returns 404 for an unknown slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/work-roles/99999/assignment-candidates`,
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(404);
    });

    it('computes hasWorkRole, isQualified and missing/expired certifications against the slot work role', async () => {
      const seed = await createEventsFixture();
      const { series, workRoleId, certificationId, slot } = await createSlotWithWorkRole(seed);

      // Admin: declared the role and is qualified, holds a valid certification.
      await db
        .insertInto('user_work_roles')
        .values({ user_id: seed.adminUserId, work_role_id: workRoleId, is_qualified: true })
        .execute();
      await db
        .insertInto('user_certifications')
        .values({
          user_id: seed.adminUserId,
          certification_id: certificationId,
          valid_until_date: new Date('2999-01-01T00:00:00.000Z'),
        })
        .execute();
      // Reader: declared the role but not qualified, certification expired.
      await db
        .insertInto('user_work_roles')
        .values({ user_id: seed.readerUserId, work_role_id: workRoleId, is_qualified: false })
        .execute();
      await db
        .insertInto('user_certifications')
        .values({
          user_id: seed.readerUserId,
          certification_id: certificationId,
          valid_until_date: new Date('2020-01-01T00:00:00.000Z'),
        })
        .execute();
      // Member: no role, no certification.

      const candidates = await candidatesOf(seed, series.id, slot.id);
      expect(candidates.map(c => c.name)).toEqual(['Admin User', 'Member User', 'Reader User']);

      const admin = candidates.find(c => c.id === seed.adminUserId);
      expect(admin).toMatchObject({
        hasWorkRole: true,
        isQualified: true,
        hasAbsence: false,
      });
      expect(admin?.missingCertifications).toEqual([]);

      const reader = candidates.find(c => c.id === seed.readerUserId);
      expect(reader).toMatchObject({ hasWorkRole: true, isQualified: false });
      expect(reader?.missingCertifications).toEqual([
        {
          certificationId,
          name: expect.stringContaining('Food Safety'),
          expiredDate: '2020-01-01',
        },
      ]);

      const member = candidates.find(c => c.id === seed.memberUserId);
      expect(member).toMatchObject({ hasWorkRole: false, isQualified: false });
      expect(member?.missingCertifications).toEqual([
        { certificationId, name: expect.stringContaining('Food Safety'), expiredDate: null },
      ]);
    });

    it('treats a certification without expiry as valid and one expiring today as still valid', async () => {
      const seed = await createEventsFixture();
      const { series, workRoleId, certificationId, slot } = await createSlotWithWorkRole(seed);

      const noExpiryUser = await createUser('No Expiry User');
      const todayUser = await createUser('Today Expiry User');
      await db
        .insertInto('user_work_roles')
        .values([
          { user_id: noExpiryUser.id, work_role_id: workRoleId, is_qualified: true },
          { user_id: todayUser.id, work_role_id: workRoleId, is_qualified: true },
        ])
        .execute();
      const today = new Date().toISOString().slice(0, 10);
      await db
        .insertInto('user_certifications')
        .values([
          { user_id: noExpiryUser.id, certification_id: certificationId, valid_until_date: null },
          {
            user_id: todayUser.id,
            certification_id: certificationId,
            valid_until_date: new Date(`${today}T00:00:00.000Z`),
          },
        ])
        .execute();

      const candidates = await candidatesOf(seed, series.id, slot.id);
      for (const id of [noExpiryUser.id, todayUser.id]) {
        expect(candidates.find(c => c.id === id)?.missingCertifications).toEqual([]);
      }
    });

    it('flags hasAbsence when a range is given and returns neutral flags for a slot without work role', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const plainSlot = await createWorkRole(seed, series.id, { title: 'Anyone' });

      // The member is absent on 2026-10-21 (inclusive day range).
      await db
        .insertInto('absences')
        .values({
          user_id: seed.memberUserId,
          type: 'away',
          start_date: new Date('2026-10-21T00:00:00.000Z'),
          end_date: new Date('2026-10-21T00:00:00.000Z'),
        })
        .execute();

      const withRange = await candidatesOf(
        seed,
        series.id,
        plainSlot.id,
        '?start=2026-10-21T10:00:00.000Z&end=2026-10-21T11:00:00.000Z',
      );
      const member = withRange.find(c => c.id === seed.memberUserId);
      expect(member?.hasAbsence).toBe(true);
      expect(member?.hasWorkRole).toBe(false);
      expect(member?.isQualified).toBe(false);
      expect(member?.missingCertifications).toEqual([]);
      expect(withRange.find(c => c.id === seed.adminUserId)?.hasAbsence).toBe(false);

      // Without a range no absence flags are computed.
      const withoutRange = await candidatesOf(seed, series.id, plainSlot.id);
      expect(withoutRange.every(c => !c.hasAbsence)).toBe(true);
    });

    it('returns 404 when the slot work role belongs to another organization', async () => {
      const seed = await createEventsFixture();
      const otherOrgId = await createOrganization(`Other Org ${randomUUID()}`, {
        defaultTimezone: 'UTC',
      });
      const otherWorkRoleId = (
        await db
          .insertInto('work_roles')
          .values({ name: `Other Role ${randomUUID()}`, organization_id: otherOrgId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      const series = await createSeries(seed, weeklyPayload);
      // Insert a slot pointing at the foreign work role directly (the API
      // validates on write, so bypass it here to test the read guard).
      const slot = await createWorkRole(seed, series.id, { title: 'Foreign role slot' });
      await db
        .updateTable('event_work_roles')
        .set({ work_role_id: otherWorkRoleId })
        .where('id', '=', slot.id)
        .execute();

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}/assignment-candidates`,
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/comments', () => {
    it('creates series-wide and occurrence-scoped comments', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);

      const seriesWide = await createComment(seed, series.id, { body: 'Series-wide note' });
      expect(seriesWide.userName).toBe('Admin User');
      const seriesWideRow = await db
        .selectFrom('event_comments')
        .select('event_occurrence_id')
        .where('id', '=', seriesWide.id)
        .executeTakeFirstOrThrow();
      expect(seriesWideRow.event_occurrence_id).toBeNull();

      const scoped = await createComment(
        seed,
        series.id,
        { body: 'Occurrence note', occurrenceStart: '2026-10-21T16:00:00.000Z' },
        seed.readerToken,
      );
      expect(scoped.userName).toBe('Reader User');
      const scopedRow = await db
        .selectFrom('event_comments')
        .innerJoin(
          'event_occurrences',
          'event_occurrences.id',
          'event_comments.event_occurrence_id',
        )
        .select('event_occurrences.occurrence_start')
        .where('event_comments.id', '=', scoped.id)
        .executeTakeFirstOrThrow();
      expect(scopedRow.occurrence_start.toISOString()).toBe('2026-10-21T16:00:00.000Z');
    });

    it('rejects a comment for a date that is not an occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/comments`,
        headers: auth(seed.adminToken),
        payload: { body: 'Nope', occurrenceStart: '2026-10-22T16:00:00.000Z' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/event-series/:seriesId/occurrences/:occurrenceStart', () => {
    it('includes the work role slots of the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      // Creating an occurrence-scoped slot materializes the occurrence and
      // inherits the parent slots into it, so the detail shows the parent
      // slot, its inherited occurrence copy and the scoped slot.
      const setupSlot = await createWorkRole(seed, series.id, {
        title: 'Setup crew',
        description: 'Arrive early',
      });
      await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      await assignToWorkRole(seed, series.id, setupSlot.id, seed.readerUserId);

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-10-21T16:00:00.000Z')}`,
        headers: auth(seed.readerToken),
      });
      expect(detail.statusCode).toBe(200);
      const detailBody = detail.json() as {
        workRoles: { id: number; title: string; assignments: { userName: string }[] }[];
        parentWorkRoles: { id: number; title: string }[];
        occurrenceWorkRoles: {
          id: number;
          title: string;
          inheritedFromWorkRoleId: number | null;
        }[];
        missingParentWorkRoles: unknown[];
      };
      expect(detailBody.workRoles.map(j => j.title).sort()).toEqual([
        'AV check',
        'Setup crew',
        'Setup crew',
      ]);
      expect(detailBody.parentWorkRoles.map(j => j.title)).toEqual(['Setup crew']);
      expect(detailBody.occurrenceWorkRoles.map(j => j.title).sort()).toEqual([
        'AV check',
        'Setup crew',
      ]);
      // The parent slot was fully inherited, so nothing is missing.
      expect(detailBody.missingParentWorkRoles).toHaveLength(0);
      const inherited = detailBody.occurrenceWorkRoles.find(j => j.title === 'Setup crew');
      expect(inherited?.inheritedFromWorkRoleId).toBe(setupSlot.id);
      const setup = detailBody.workRoles.find(j => j.title === 'Setup crew');
      expect(setup?.assignments.map(a => a.userName)).toEqual(['Reader User']);

      // Another occurrence of the series is not materialized, so only the
      // parent slot is visible for it.
      const other = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-10-26T17:00:00.000Z')}`,
        headers: auth(seed.readerToken),
      });
      const otherBody = other.json() as { workRoles: { title: string }[] };
      expect(otherBody.workRoles.map(j => j.title)).toEqual(['Setup crew']);
    });

    it('includes the comments of the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      await createComment(seed, series.id, { body: 'Series-wide note' });
      await createComment(
        seed,
        series.id,
        { body: 'Occurrence note', occurrenceStart: '2026-10-21T16:00:00.000Z' },
        seed.readerToken,
      );

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-10-21T16:00:00.000Z')}`,
        headers: auth(seed.readerToken),
      });
      const comments = (detail.json() as { comments: { body: string }[] }).comments;
      expect(comments.map(c => c.body)).toEqual(['Series-wide note', 'Occurrence note']);
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/work-roles/:workRoleId', () => {
    it('updates a work role slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { title: 'Setup crew (updated)' },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as { title: string }).title).toBe('Setup crew (updated)');
    });

    it('toggles the required (critical) flag and updates the description', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { isCritical: true, description: 'Arrive 30 minutes early' },
      });
      expect(response.statusCode).toBe(200);
      const updated = response.json() as { isCritical: boolean; description: string };
      expect(updated.isCritical).toBe(true);
      expect(updated.description).toBe('Arrive 30 minutes early');

      // Toggle back to not required.
      const back = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { isCritical: false },
      });
      expect(back.statusCode).toBe(200);
      expect((back.json() as { isCritical: boolean }).isCritical).toBe(false);
    });

    it('rejects a work role from another organization', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      const otherOrgId = await createOrganization(`Other Org ${randomUUID()}`, {
        defaultTimezone: 'UTC',
      });
      const otherWorkRoleId = (
        await db
          .insertInto('work_roles')
          .values({ name: 'Other Org Role', organization_id: otherOrgId })
          .returning('id')
          .executeTakeFirstOrThrow()
      ).id;
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { workRoleId: otherWorkRoleId },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/event-occurrences/:eventOccurrenceId/work-roles/:workRoleId', () => {
    it('toggles required and edits the description of an occurrence-level slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      expect(slot.occurrenceId).not.toBeNull();
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { isCritical: true, description: 'Only for this occurrence' },
      });
      expect(response.statusCode).toBe(200);
      const updated = response.json() as {
        id: number;
        occurrenceId: number;
        isCritical: boolean;
        description: string;
      };
      expect(updated.occurrenceId).toBe(slot.occurrenceId);
      expect(updated.isCritical).toBe(true);
      expect(updated.description).toBe('Only for this occurrence');

      // Toggle back to not required.
      const back = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { isCritical: false },
      });
      expect(back.statusCode).toBe(200);
      expect((back.json() as { isCritical: boolean }).isCritical).toBe(false);
    });

    it('resolves a parent slot reference to its inherited occurrence copy', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const parentSlot = await createWorkRole(seed, series.id, {
        title: 'Setup crew',
        description: 'Parent description',
      });
      // Materialize the occurrence by adding an occurrence-scoped slot; the
      // parent slot is inherited into the occurrence on materialization.
      const occurrenceSlot = await createWorkRole(seed, series.id, {
        title: 'Extra helper',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const occurrenceId = occurrenceSlot.occurrenceId as number;
      expect(occurrenceId).not.toBeNull();

      // Reference the parent slot through the occurrence endpoint.
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${parentSlot.id}`,
        headers: auth(seed.adminToken),
        payload: { isCritical: true },
      });
      expect(response.statusCode).toBe(200);
      const updated = response.json() as {
        id: number;
        isCritical: boolean;
        inheritedFromWorkRoleId: number | null;
      };
      expect(updated.id).not.toBe(parentSlot.id);
      expect(updated.inheritedFromWorkRoleId).toBe(parentSlot.id);
      expect(updated.isCritical).toBe(true);

      // The parent slot itself is unchanged.
      const listResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/work-roles`,
        headers: auth(seed.readerToken),
      });
      expect(listResponse.statusCode).toBe(200);
      const parent = (listResponse.json() as { id: number; isCritical: boolean }[]).find(
        s => s.id === parentSlot.id,
      );
      expect(parent?.isCritical).toBe(false);
    });

    it('returns 404 when the slot does not exist in the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const otherSeries = await createSeries(seed, {
        title: 'Other series',
        start: '2026-10-23T16:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
      });
      const otherSlot = await createWorkRole(seed, otherSeries.id, { title: 'Other slot' });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/work-roles/${otherSlot.id}`,
        headers: auth(seed.adminToken),
        payload: { isCritical: true },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-occurrences/:eventOccurrenceId/work-roles/:workRoleId/assignments', () => {
    it('assigns a user to an occurrence-level slot referenced by its own ID', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/work-roles/${slot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: seed.memberUserId },
      });
      expect(response.statusCode).toBe(200);
      const assignment = response.json() as { eventWorkRoleId: number; userId: string };
      expect(assignment.eventWorkRoleId).toBe(slot.id);
      expect(assignment.userId).toBe(seed.memberUserId);
    });

    it('assigns to the inherited copy when the parent slot of a materialized occurrence is referenced', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const parentSlot = await createWorkRole(seed, series.id, { title: 'Kitchen Helper' });

      // Materialize the occurrence the way the occurrence page does for a tmp ref.
      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const materialize = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      expect(materialize.statusCode).toBe(200);
      const { occurrenceId } = materialize.json() as { occurrenceId: number };

      // The occurrence page shows the parent slots until the occurrence is
      // materialized, so the assign call references the parent slot ID.
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${parentSlot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: seed.memberUserId },
      });
      expect(response.statusCode).toBe(200);
      const assignment = response.json() as { eventWorkRoleId: number; userId: string };
      expect(assignment.userId).toBe(seed.memberUserId);
      expect(assignment.eventWorkRoleId).not.toBe(parentSlot.id);

      // The assignment landed on the occurrence-level copy inherited from the
      // parent slot.
      const copy = await db
        .selectFrom('event_work_roles')
        .select(['id', 'event_occurrence_id', 'inherited_from_work_role_id'])
        .where('id', '=', assignment.eventWorkRoleId)
        .executeTakeFirstOrThrow();
      expect(copy.event_occurrence_id).toBe(occurrenceId);
      expect(copy.inherited_from_work_role_id).toBe(parentSlot.id);

      // The parent slot itself got no assignment.
      const parentAssignments = await db
        .selectFrom('event_work_role_assignments')
        .selectAll()
        .where('event_work_role_id', '=', parentSlot.id)
        .execute();
      expect(parentAssignments).toHaveLength(0);
    });

    it('returns 404 when the slot does not exist in the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const otherSeries = await createSeries(seed, {
        title: 'Other series',
        start: '2026-10-23T16:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
      });
      const otherSlot = await createWorkRole(seed, otherSeries.id, { title: 'Other slot' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/work-roles/${otherSlot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: seed.memberUserId },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/event-occurrences/:eventOccurrenceId/work-roles/:workRoleId/assignments/:assignmentId', () => {
    it('unassigns via the parent slot reference using the parent assignment ID', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const parentSlot = await createWorkRole(seed, series.id, { title: 'Kitchen Helper' });
      const parentAssignment = await assignToWorkRole(
        seed,
        series.id,
        parentSlot.id,
        seed.memberUserId,
      );

      // Materialize: the parent slot and its assignment are copied to the occurrence.
      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const materialize = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      expect(materialize.statusCode).toBe(200);
      const { occurrenceId } = materialize.json() as { occurrenceId: number };

      // The occurrence page lists the parent assignments before materialization,
      // so the unassign call references the parent slot and assignment IDs.
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-occurrences/${occurrenceId}/work-roles/${parentSlot.id}/assignments/${parentAssignment.id}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);

      // The inherited copy's assignment is gone, the parent assignment is intact.
      const copySlot = await db
        .selectFrom('event_work_roles')
        .select('id')
        .where('event_occurrence_id', '=', occurrenceId)
        .where('inherited_from_work_role_id', '=', parentSlot.id)
        .executeTakeFirstOrThrow();
      const copyAssignments = await db
        .selectFrom('event_work_role_assignments')
        .selectAll()
        .where('event_work_role_id', '=', copySlot.id)
        .execute();
      expect(copyAssignments).toHaveLength(0);
      const remainingParent = await db
        .selectFrom('event_work_role_assignments')
        .selectAll()
        .where('id', '=', parentAssignment.id)
        .execute();
      expect(remainingParent).toHaveLength(1);
    });
  });

  describe('GET /api/v1/event-occurrences/:eventOccurrenceId/comments', () => {
    it('lists series-wide and occurrence-scoped comments', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      await createComment(seed, series.id, { body: 'Series-wide comment' });
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const occurrenceId = slot.occurrenceId as number;
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments`,
        headers: auth(seed.adminToken),
        payload: { body: 'Occurrence comment' },
      });
      expect(created.statusCode).toBe(200);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments`,
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(200);
      const bodies = (response.json() as { body: string }[]).map(c => c.body);
      expect(bodies).toContain('Series-wide comment');
      expect(bodies).toContain('Occurrence comment');
    });
  });

  describe('POST /api/v1/event-occurrences/:eventOccurrenceId/comments', () => {
    it('creates an occurrence-scoped comment attributed to the current user', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/comments`,
        headers: auth(seed.adminToken),
        payload: { body: 'Please bring the keys' },
      });
      expect(response.statusCode).toBe(200);
      const comment = response.json() as { userId: string; userName: string; body: string };
      expect(comment.userId).toBe(seed.adminUserId);
      expect(comment.body).toBe('Please bring the keys');
    });

    it('returns 404 for an unknown occurrence', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-occurrences/999/comments',
        headers: auth(seed.adminToken),
        payload: { body: 'Hello' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/event-occurrences/:eventOccurrenceId/comments/:commentId', () => {
    it('lets the author edit the comment and rejects other users', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const occurrenceId = slot.occurrenceId as number;
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments`,
        headers: auth(seed.adminToken),
        payload: { body: 'Original' },
      });
      const commentId = (created.json() as { id: number }).id;

      const forbiddenResponse = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments/${commentId}`,
        headers: auth(seed.readerToken),
        payload: { body: 'Hijacked' },
      });
      expect(forbiddenResponse.statusCode).toBe(403);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments/${commentId}`,
        headers: auth(seed.adminToken),
        payload: { body: 'Edited' },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as { body: string }).body).toBe('Edited');
    });
  });

  describe('DELETE /api/v1/event-occurrences/:eventOccurrenceId/comments/:commentId', () => {
    it('lets the author delete the comment and rejects other users', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const occurrenceId = slot.occurrenceId as number;
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments`,
        headers: auth(seed.adminToken),
        payload: { body: 'To be deleted' },
      });
      const commentId = (created.json() as { id: number }).id;

      const forbiddenResponse = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments/${commentId}`,
        headers: auth(seed.readerToken),
      });
      expect(forbiddenResponse.statusCode).toBe(403);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments/${commentId}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/comments`,
        headers: auth(seed.readerToken),
      });
      expect((list.json() as { id: number }[]).map(c => c.id)).not.toContain(commentId);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/info-slots', () => {
    it('creates a parent info slot and lists it via the series endpoint', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Sermon topic', description: 'Text of the sermon', value: null },
      });
      expect(created.statusCode).toBe(200);
      const slot = created.json() as {
        id: number;
        occurrenceId: number | null;
        title: string;
        value: string | null;
      };
      expect(slot.occurrenceId).toBeNull();
      expect(slot.title).toBe('Sermon topic');

      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.readerToken),
      });
      expect(list.statusCode).toBe(200);
      const items = list.json() as { id: number; title: string }[];
      expect(items.map(s => s.title)).toContain('Sermon topic');
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/info-slots/:infoSlotId', () => {
    it('updates title, description and default value of a parent info slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Band composition' },
      });
      const slotId = (created.json() as { id: number }).id;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/info-slots/${slotId}`,
        headers: auth(seed.adminToken),
        payload: { title: 'Band', description: 'Who plays', value: 'Full band' },
      });
      expect(response.statusCode).toBe(200);
      const updated = response.json() as { title: string; description: string; value: string };
      expect(updated.title).toBe('Band');
      expect(updated.description).toBe('Who plays');
      expect(updated.value).toBe('Full band');
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/info-slots/:infoSlotId', () => {
    it('deletes a parent info slot but keeps occurrence copies', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Special notes' },
      });
      const parentId = (created.json() as { id: number }).id;

      // Materialize the occurrence: the parent info slot is inherited.
      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const mat = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      const { occurrenceId } = mat.json() as { occurrenceId: number };

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/info-slots/${parentId}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);

      // The occurrence copy still exists (inherited reference set to NULL).
      const occSlots = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots`,
        headers: auth(seed.readerToken),
      });
      const slots = occSlots.json() as { title: string; inheritedFromInfoSlotId: number | null }[];
      expect(slots).toHaveLength(1);
      expect(slots[0].title).toBe('Special notes');
      expect(slots[0].inheritedFromInfoSlotId).toBeNull();
    });
  });

  describe('GET /api/v1/event-occurrences/:eventOccurrenceId/info-slots', () => {
    it('returns the inherited copies with the parent value as default after materialization', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const parent = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Sermon topic', value: 'Default topic' },
      });
      const parentId = (parent.json() as { id: number }).id;

      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const mat = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      const { occurrenceId } = mat.json() as { occurrenceId: number };

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots`,
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(200);
      const slots = response.json() as {
        id: number;
        occurrenceId: number;
        inheritedFromInfoSlotId: number;
        value: string | null;
      }[];
      expect(slots).toHaveLength(1);
      expect(slots[0].occurrenceId).toBe(occurrenceId);
      expect(slots[0].inheritedFromInfoSlotId).toBe(parentId);
      expect(slots[0].value).toBe('Default topic');
    });
  });

  describe('PATCH /api/v1/event-occurrences/:eventOccurrenceId/info-slots/:infoSlotId', () => {
    it('sets the value via the occurrence slot ID and via the parent slot ID', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const parent = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Sermon topic' },
      });
      const parentId = (parent.json() as { id: number }).id;

      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const mat = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      const { occurrenceId } = mat.json() as { occurrenceId: number };

      const occSlots = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots`,
        headers: auth(seed.readerToken),
      });
      const copyId = (occSlots.json() as { id: number }[])[0].id;

      // Reference the occurrence-level copy directly.
      const direct = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots/${copyId}`,
        headers: auth(seed.adminToken),
        payload: { value: 'The Good Samaritan' },
      });
      expect(direct.statusCode).toBe(200);
      expect((direct.json() as { value: string }).value).toBe('The Good Samaritan');

      // Reference the parent slot: resolves to the inherited occurrence copy.
      const viaParent = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots/${parentId}`,
        headers: auth(seed.adminToken),
        payload: { value: 'Updated topic' },
      });
      expect(viaParent.statusCode).toBe(200);
      const updated = viaParent.json() as { id: number; value: string };
      expect(updated.id).toBe(copyId);
      expect(updated.value).toBe('Updated topic');

      // The parent slot's value is unchanged.
      const seriesSlots = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.readerToken),
      });
      const parentSlot = (seriesSlots.json() as { id: number; value: string | null }[]).find(
        s => s.id === parentId,
      );
      expect(parentSlot?.value).toBeNull();
    });

    it('returns 404 when the info slot does not exist in the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-occurrences/${slot.occurrenceId as number}/info-slots/999`,
        headers: auth(seed.adminToken),
        payload: { value: 'x' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-occurrences/:occurrenceRef/import-info-slots', () => {
    it('syncs info slots added to the series after materialization into the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Sermon topic' },
      });

      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const mat = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      const { occurrenceId } = mat.json() as { occurrenceId: number };

      // A new info slot is added to the series after the occurrence was materialized.
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Special notes', value: 'Default notes' },
      });

      const before = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots`,
        headers: auth(seed.readerToken),
      });
      expect((before.json() as unknown[]).length).toBe(1);

      const imported = await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${occurrenceId}/import-info-slots`,
        headers: auth(seed.adminToken),
      });
      expect(imported.statusCode).toBe(200);
      const importedSlots = imported.json() as { title: string; value: string | null }[];
      expect(importedSlots.map(s => s.title)).toEqual(['Special notes']);
      expect(importedSlots[0].value).toBe('Default notes');

      // Importing again does not duplicate.
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${occurrenceId}/import-info-slots`,
        headers: auth(seed.adminToken),
      });
      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}/info-slots`,
        headers: auth(seed.readerToken),
      });
      expect((after.json() as unknown[]).length).toBe(2);
    });
  });

  describe('GET /api/v1/event-occurrences/:occurrenceRef', () => {
    it('includes info slots and missing parent info slots in the detail', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Sermon topic' },
      });

      // Not yet materialized: the parent info slots are shown.
      const ref = encodeURIComponent(`tmp:${series.id}:2026-10-21T16:00:00.000Z`);
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${ref}`,
        headers: auth(seed.readerToken),
      });
      expect(detail.statusCode).toBe(200);
      const body = detail.json() as {
        infoSlots: { title: string }[];
        parentInfoSlots: { title: string }[];
        occurrenceInfoSlots: unknown[];
        missingParentInfoSlots: unknown[];
      };
      expect(body.infoSlots.map(s => s.title)).toEqual(['Sermon topic']);
      expect(body.occurrenceInfoSlots).toHaveLength(0);

      // After materialization plus a new parent slot, the new slot is "missing".
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-occurrences/${ref}/materialize`,
        headers: auth(seed.adminToken),
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/info-slots`,
        headers: auth(seed.adminToken),
        payload: { title: 'Band composition' },
      });
      const { occurrenceId } = (
        await app.inject({
          method: 'POST',
          url: `/api/v1/event-occurrences/${ref}/materialize`,
          headers: auth(seed.adminToken),
        })
      ).json() as { occurrenceId: number };
      const detail2 = await app.inject({
        method: 'GET',
        url: `/api/v1/event-occurrences/${occurrenceId}`,
        headers: auth(seed.readerToken),
      });
      const body2 = detail2.json() as {
        infoSlots: { title: string }[];
        missingParentInfoSlots: { title: string }[];
      };
      expect(body2.infoSlots.map(s => s.title)).toEqual(['Sermon topic']);
      expect(body2.missingParentInfoSlots.map(s => s.title)).toEqual(['Band composition']);
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/work-roles/:workRoleId/assignments/:assignmentId', () => {
    it('unassigns a user from a work role slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'Setup crew' });
      const assignment = await assignToWorkRole(seed, series.id, slot.id, seed.readerUserId);
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}/assignments/${assignment.id}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/work-roles/:workRoleId', () => {
    it('deletes a work role slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createWorkRole(seed, series.id, { title: 'AV check' });
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/work-roles/${slot.id}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/comments/:commentId', () => {
    it('lets only the author edit a comment', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      // Only the author can edit a comment.
      const comment = await createComment(
        seed,
        series.id,
        { body: 'Occurrence note', occurrenceStart: '2026-10-21T16:00:00.000Z' },
        seed.readerToken,
      );

      const forbidden = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/comments/${comment.id}`,
        headers: auth(seed.adminToken),
        payload: { body: 'Hijacked' },
      });
      expect(forbidden.statusCode).toBe(403);

      const updated = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/comments/${comment.id}`,
        headers: auth(seed.readerToken),
        payload: { body: 'Occurrence note (edited)' },
      });
      expect(updated.statusCode).toBe(200);
      expect((updated.json() as { body: string }).body).toBe('Occurrence note (edited)');
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/comments/:commentId', () => {
    it('deletes a comment', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const comment = await createComment(seed, series.id, { body: 'Series-wide note' });
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/comments/${comment.id}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId', () => {
    it('drops exceptions when the recurrence changes', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      // Create an exception.
      const occurrenceStart = encodeURIComponent('2026-10-26T17:00:00.000Z');
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/occurrences/${occurrenceStart}/cancel`,
        headers: auth(seed.adminToken),
      });
      const exceptions = await exceptionsOf(seed, series.id);
      expect(exceptions).toHaveLength(1);

      // Change the recurrence.
      const updated = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
        payload: { recurrence: { freq: 'DAILY' } },
      });
      expect(updated.statusCode).toBe(200);
      expect((updated.json() as EventSeriesResponse).rrule).toBe('RRULE:FREQ=DAILY');

      expect(await exceptionsOf(seed, series.id)).toEqual([]);
    });

    it('reports booking conflicts when the series time is moved into an overlapping booking', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      await createSeries(seed, {
        title: 'Existing booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });
      const series = await createSeries(seed, {
        title: 'Movable booking',
        start: '2026-10-21T14:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });

      // Moving into the existing booking's time reports the conflict.
      const moved = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
        payload: { start: '2026-10-21T10:30:00.000Z' },
      });
      expect(moved.statusCode).toBe(200);
      const movedBody = moved.json() as EventSeriesResponse;
      expect(movedBody.conflicts).toHaveLength(1);
      expect(movedBody.conflicts?.[0].title).toBe('Existing booking');

      // Moving away again reports no conflicts.
      const movedAway = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
        payload: { start: '2026-10-21T14:00:00.000Z' },
      });
      expect((movedAway.json() as EventSeriesResponse).conflicts).toEqual([]);
    });

    it('reports booking conflicts when the room is changed via the update endpoint', async () => {
      const seed = await createEventsFixture();
      const suffix = randomUUID();
      const { roomId: roomAId } = await createSiteAndRoom(seed.organizationId, `${suffix}-a`);
      const { roomId: roomBId } = await createSiteAndRoom(seed.organizationId, `${suffix}-b`);
      await createSeries(seed, {
        title: 'Room A booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId: roomAId,
      });
      const series = await createSeries(seed, {
        title: 'Room B booking',
        start: '2026-10-21T10:30:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId: roomBId,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
        payload: { roomId: roomAId },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.roomId).toBe(roomAId);
      expect(body.conflicts?.map(c => c.title)).toContain('Room A booking');
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/config', () => {
    it('reports booking conflicts when a room is assigned to a series that overlaps another series in it', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      await createSeries(seed, {
        title: 'Existing booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });
      const series = await createSeries(seed, {
        title: 'Unlocated booking',
        start: '2026-10-21T10:30:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/config`,
        headers: auth(seed.adminToken),
        payload: { roomId },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.roomId).toBe(roomId);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts?.[0].title).toBe('Existing booking');
    });

    it('reports no conflicts when the location is cleared', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      await createSeries(seed, {
        title: 'Existing booking',
        start: '2026-10-21T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });
      const series = await createSeries(seed, {
        title: 'Located booking',
        start: '2026-10-21T10:30:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/config`,
        headers: auth(seed.adminToken),
        payload: { siteId: null, roomId: null },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.siteId).toBeNull();
      expect(body.roomId).toBeNull();
      expect(body.conflicts).toEqual([]);
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId', () => {
    it('deletes a series with its work role slots and comments', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      await createWorkRole(seed, series.id, { title: 'Setup crew' });
      await createComment(seed, series.id, { body: 'Series-wide note' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}`,
        headers: auth(seed.adminToken),
      });
      expect(detail.statusCode).toBe(404);

      const slots = await db
        .selectFrom('event_work_roles')
        .selectAll()
        .where('event_series_id', '=', series.id)
        .execute();
      expect(slots).toHaveLength(0);
      const comments = await db
        .selectFrom('event_comments')
        .selectAll()
        .where('event_series_id', '=', series.id)
        .execute();
      expect(comments).toHaveLength(0);
    });
  });

  describe('GET /api/v1/event-series/management', () => {
    it('restricts the management list to one organization when organizationId is given', async () => {
      const twoOrg = await createTwoOrgFixture();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/management?organizationId=${twoOrg.organizationBId}`,
        headers: auth(twoOrg.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { items: ManagementItem[]; total: number };
      expect(body.total).toBe(1);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].id).toBe(twoOrg.seriesBId);
      expect(body.items[0].organizationId).toBe(twoOrg.organizationBId);
      expect(body.items[0].organizationName).toBe(twoOrg.organizationBName);
    });

    it('requires organizationId on the management list', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/event-series/management',
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/event-series/:seriesId/management', () => {
    it('includes the organization in the management detail of a series', async () => {
      const twoOrg = await createTwoOrgFixture();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${twoOrg.seriesAId}/management`,
        headers: auth(twoOrg.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as ManagementItem;
      expect(body.organizationId).toBe(twoOrg.organizationAId);
      expect(body.organizationName).toBe(twoOrg.organizationAName);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/occurrences/:occurrenceStart/split', () => {
    it('splits a series: the new series continues, the original is truncated, exceptions reset', async () => {
      const seed = await createEventsFixture();
      const weekly = await createSeries(seed, splitWeeklyPayload);

      // Past exception (before the split point) and future exception (after it).
      const cancelPast = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${weekly.id}/occurrences/${encodeURIComponent('2026-11-02T10:00:00.000Z')}/cancel`,
        headers: auth(seed.adminToken),
        payload: {},
      });
      expect(cancelPast.statusCode).toBe(200);
      const cancelFuture = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${weekly.id}/occurrences/${encodeURIComponent('2026-11-09T10:00:00.000Z')}/cancel`,
        headers: auth(seed.adminToken),
        payload: {},
      });
      expect(cancelFuture.statusCode).toBe(200);

      const response = await split(seed, weekly.id, '2026-11-04T10:00:00.000Z', {
        title: 'Weekly sync (evening)',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      const newId = body.id;
      expect(newId).not.toBe(weekly.id);
      expect(body.title).toBe('Weekly sync (evening)');
      expect(body.start).toBe('2026-11-04T10:00:00.000Z');
      expect(body.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');

      // The original series is truncated just before the split occurrence.
      const original = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${weekly.id}`,
        headers: auth(seed.adminToken),
      });
      expect((original.json() as EventSeriesResponse).rrule).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261104T095959Z',
      );

      // Original: only occurrences before the split point (the cancelled one is
      // hidden), and the past exception survives.
      const originalOccurrences = await occurrencesOf(
        seed,
        weekly.id,
        '2026-10-26T00:00:00.000Z',
        '2026-11-04T00:00:00.000Z',
      );
      expect(originalOccurrences.map(o => o.occurrenceStart)).toEqual([
        '2026-10-26T10:00:00.000Z',
        '2026-10-28T10:00:00.000Z',
      ]);
      const exceptions = await exceptionsOf(seed, weekly.id);
      expect(exceptions.map(e => e.occurrenceStart)).toEqual(['2026-11-02T10:00:00.000Z']);

      // New series: occurrences from the split point on, with the future
      // exception reset (nothing cancelled).
      const newOccurrences = await occurrencesOf(
        seed,
        newId,
        '2026-11-01T00:00:00.000Z',
        '2026-12-01T00:00:00.000Z',
      );
      expect(newOccurrences.map(o => o.occurrenceStart)).toEqual([
        '2026-11-04T10:00:00.000Z',
        '2026-11-09T10:00:00.000Z',
        '2026-11-11T10:00:00.000Z',
        '2026-11-16T10:00:00.000Z',
        '2026-11-18T10:00:00.000Z',
        '2026-11-23T10:00:00.000Z',
        '2026-11-25T10:00:00.000Z',
        '2026-11-30T10:00:00.000Z',
      ]);
      expect(newOccurrences.every(o => !o.isCancelled)).toBe(true);
      expect(await exceptionsOf(seed, newId)).toEqual([]);
    });

    it('does not cascade later edits of the original series to the new series', async () => {
      const seed = await createEventsFixture();
      const weekly = await createSeries(seed, splitWeeklyPayload);

      const response = await split(seed, weekly.id, '2026-11-04T10:00:00.000Z', {
        title: 'Weekly sync (evening)',
      });
      expect(response.statusCode).toBe(200);
      const newId = (response.json() as EventSeriesResponse).id;

      const updated = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${weekly.id}`,
        headers: auth(seed.adminToken),
        payload: { title: 'Original renamed' },
      });
      expect(updated.statusCode).toBe(200);

      const after = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${newId}`,
        headers: auth(seed.readerToken),
      });
      expect((after.json() as EventSeriesResponse).title).toBe('Weekly sync (evening)');
    });

    it('splitting at the first occurrence updates the series in place and resets exceptions', async () => {
      const seed = await createEventsFixture();
      const daily = await createSeries(seed, {
        title: 'Daily',
        start: '2026-11-01T10:00:00.000Z',
        durationMinutes: 30,
        timezone: 'UTC',
        recurrence: { freq: 'DAILY' },
      });

      const cancel = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${daily.id}/occurrences/${encodeURIComponent('2026-11-03T10:00:00.000Z')}/cancel`,
        headers: auth(seed.adminToken),
        payload: {},
      });
      expect(cancel.statusCode).toBe(200);

      const response = await split(seed, daily.id, '2026-11-01T10:00:00.000Z', {
        title: 'Renamed daily',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.id).toBe(daily.id);
      expect(body.title).toBe('Renamed daily');
      expect(body.rrule).toBe('RRULE:FREQ=DAILY');

      // All exceptions are reset (the split occurrence was the first).
      expect(await exceptionsOf(seed, daily.id)).toEqual([]);
      const occurrences = await occurrencesOf(
        seed,
        daily.id,
        '2026-11-01T00:00:00.000Z',
        '2026-11-05T00:00:00.000Z',
      );
      expect(occurrences.map(o => o.occurrenceStart)).toEqual([
        '2026-11-01T10:00:00.000Z',
        '2026-11-02T10:00:00.000Z',
        '2026-11-03T10:00:00.000Z',
        '2026-11-04T10:00:00.000Z',
      ]);
    });

    it('splitting a one-off series updates it in place', async () => {
      const seed = await createEventsFixture();
      const oneOff = await createSeries(seed, {
        title: 'One-off',
        start: '2026-12-01T10:00:00.000Z',
        timezone: 'UTC',
      });

      const response = await split(seed, oneOff.id, '2026-12-01T10:00:00.000Z', {
        title: 'One-off renamed',
        durationMinutes: 90,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.id).toBe(oneOff.id);
      expect(body.title).toBe('One-off renamed');
      expect(body.rrule).toBeNull();
      expect(body.durationMinutes).toBe(90);
      expect(body.start).toBe('2026-12-01T10:00:00.000Z');
    });

    it('reports booking conflicts of the new series created by the split', async () => {
      const seed = await createEventsFixture();
      const { roomId } = await createSiteAndRoom(seed.organizationId, randomUUID());
      const weekly = await createSeries(seed, { ...splitWeeklyPayload, roomId });
      // Another booking in the same room overlapping an occurrence after the split point.
      await createSeries(seed, {
        title: 'Other booking',
        start: '2026-11-04T10:30:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        roomId,
      });

      const response = await split(seed, weekly.id, '2026-11-04T10:00:00.000Z', {
        title: 'Weekly sync (split)',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.id).not.toBe(weekly.id);
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts?.[0].title).toBe('Other booking');
      expect(body.conflicts?.[0].occurrenceStart).toBe('2026-11-04T10:30:00.000Z');
    });

    it('re-anchors an inherited recurrence so the new start is an occurrence', async () => {
      const seed = await createEventsFixture();
      const reanchor = await createSeries(seed, { ...splitWeeklyPayload, title: 'Reanchor' });

      // Split at the Wednesday occurrence but move the new series to a Thursday.
      const response = await split(seed, reanchor.id, '2026-10-28T10:00:00.000Z', {
        start: '2026-10-29T10:00:00.000Z',
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as EventSeriesResponse;
      expect(body.id).not.toBe(reanchor.id);
      expect(body.start).toBe('2026-10-29T10:00:00.000Z');
      expect(body.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,TH');

      // The original series is truncated just before the split occurrence.
      const original = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${reanchor.id}`,
        headers: auth(seed.adminToken),
      });
      expect((original.json() as EventSeriesResponse).rrule).toBe(
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261028T095959Z',
      );
      const originalOccurrences = await occurrencesOf(
        seed,
        reanchor.id,
        '2026-10-26T00:00:00.000Z',
        '2026-10-29T00:00:00.000Z',
      );
      expect(originalOccurrences.map(o => o.occurrenceStart)).toEqual(['2026-10-26T10:00:00.000Z']);

      // The new series contains the new Thursday start and continues Mon/Wed/Thu.
      const newOccurrences = await occurrencesOf(
        seed,
        body.id,
        '2026-10-29T00:00:00.000Z',
        '2026-11-10T00:00:00.000Z',
      );
      expect(newOccurrences.map(o => o.occurrenceStart)).toEqual([
        '2026-10-29T10:00:00.000Z',
        '2026-11-02T10:00:00.000Z',
        '2026-11-04T10:00:00.000Z',
        '2026-11-05T10:00:00.000Z',
        '2026-11-09T10:00:00.000Z',
      ]);
    });

    it('rejects an explicit recurrence that does not contain the new start', async () => {
      const seed = await createEventsFixture();
      const weekly = await createSeries(seed, splitWeeklyPayload);
      const response = await split(seed, weekly.id, '2026-10-28T10:00:00.000Z', {
        start: '2026-10-29T10:00:00.000Z', // a Thursday
        recurrence: { freq: 'WEEKLY', byWeekdays: [1] }, // Mondays only
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when the split point is not an occurrence of the series', async () => {
      const seed = await createEventsFixture();
      const weekly = await createSeries(seed, splitWeeklyPayload);
      // 2026-10-27 is a Tuesday; the series repeats on Mondays and Wednesdays.
      const response = await split(seed, weekly.id, '2026-10-27T10:00:00.000Z', { title: 'Nope' });
      expect(response.statusCode).toBe(404);
    });

    it('returns 403 for a member without events:write', async () => {
      const seed = await createEventsFixture();
      const weekly = await createSeries(seed, splitWeeklyPayload);
      const response = await split(
        seed,
        weekly.id,
        '2026-10-28T10:00:00.000Z',
        { title: 'Nope' },
        seed.memberToken,
      );
      expect(response.statusCode).toBe(403);
    });
  });
});

describe('Calendars API', () => {
  describe('GET /api/v1/calendars', () => {
    it('lists calendars for a user with events:read', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/calendars?organizationId=${seed.organizationId}`,
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(200);
      const calendars = response.json() as Array<{
        id: string;
        name: string;
        organizationId: string;
      }>;
      expect(calendars.some(calendar => calendar.id === seed.calendarId)).toBe(true);
    });

    it('restricts the calendar list to one organization when organizationId is given', async () => {
      const twoOrg = await createTwoOrgFixture();
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/calendars?organizationId=${twoOrg.organizationBId}`,
        headers: auth(twoOrg.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as Array<{ id: string; organizationId: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(twoOrg.calendarBId);
      expect(body[0].organizationId).toBe(twoOrg.organizationBId);
    });

    it('requires organizationId on the calendar list', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/calendars',
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/calendars', () => {
    it('creates a calendar and rejects duplicate Google Calendar IDs', async () => {
      const seed = await createEventsFixture();
      const googleCalendarId = `gcal-${randomUUID()}`;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/calendars',
        headers: auth(seed.adminToken),
        payload: {
          name: 'Second Calendar',
          organizationId: seed.organizationId,
          googleCalendarId,
        },
      });
      expect(response.statusCode).toBe(200);
      const calendar = response.json() as {
        id: string;
        name: string;
        organizationId: string;
        googleCalendarId: string | null;
      };
      expect(calendar.name).toBe('Second Calendar');
      expect(calendar.organizationId).toBe(seed.organizationId);
      expect(calendar.googleCalendarId).toBe(googleCalendarId);

      const duplicate = await app.inject({
        method: 'POST',
        url: '/api/v1/calendars',
        headers: auth(seed.adminToken),
        payload: {
          name: 'Duplicate Calendar',
          organizationId: seed.organizationId,
          googleCalendarId,
        },
      });
      expect(duplicate.statusCode).toBe(400);
    });

    it('returns 404 when creating a calendar for an unknown organization', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/calendars',
        headers: auth(seed.adminToken),
        payload: { name: 'Orphan Calendar', organizationId: randomUUID() },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns 403 for a member without events:write', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/calendars',
        headers: auth(seed.memberToken),
        payload: { name: 'Forbidden Calendar', organizationId: seed.organizationId },
      });
      expect(response.statusCode).toBe(403);
    });
  });
});

describe('Organizations API', () => {
  describe('GET /api/v1/organizations', () => {
    it('lists the organizations the current user belongs to', async () => {
      const seed = await createEventsFixture();
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations',
        headers: auth(seed.readerToken),
      });
      expect(response.statusCode).toBe(200);
      const organizations = response.json() as Array<{
        id: string;
        name: string;
        defaultTimezone: string;
      }>;
      const own = organizations.find(organization => organization.id === seed.organizationId);
      expect(own).toBeDefined();
      expect(own?.defaultTimezone).toBe('Europe/Berlin');
    });
  });
});
