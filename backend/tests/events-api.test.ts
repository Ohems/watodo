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
// the future), per-occurrence cancel/reschedule, job slots with user
// assignments, and comments. Every test resets the database (beforeEach) and
// builds its own fixture through the factories in tests/helpers/fixtures.ts,
// so tests are independent and a broken seed fails the test instead of being
// masked. The test database is required: the global setup fails the run when
// it is not reachable.

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
}

interface OccurrenceResponse {
  seriesId: number;
  occurrenceStart: string;
  start: string;
  end: string;
  isRescheduled: boolean;
  isCancelled: boolean;
  exceptionId: number | null;
}

interface ExceptionResponse {
  id: number;
  occurrenceStart: string;
  isCancelled: boolean;
  overrideStart: string | null;
  overrideEnd: string | null;
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

const createJob = async (
  seed: Seed,
  seriesId: number,
  payload: Record<string, unknown>,
): Promise<{ id: number; occurrenceStart: string | null }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/jobs`,
    headers: auth(seed.adminToken),
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { id: number; occurrenceStart: string | null };
};

const assignToJob = async (
  seed: Seed,
  seriesId: number,
  jobId: number,
  userId: string,
): Promise<{ id: number; userName: string }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/jobs/${jobId}/assignments`,
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
): Promise<{ id: number; userName: string; occurrenceStart: string | null }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seriesId}/comments`,
    headers: auth(token),
    payload,
  });
  expect(response.statusCode).toBe(200);
  return response.json() as { id: number; userName: string; occurrenceStart: string | null };
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
// the occurrence, job, comment and split tests.
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

      // The reader is assigned to a series-wide job on series A (covering all
      // its occurrences) and to an occurrence-scoped job on series C.
      const jobA = await createJob(seed, seriesAId, { title: 'Series-wide job' });
      await assignToJob(seed, seriesAId, jobA.id, seed.readerUserId);

      const jobC = await createJob(seed, seriesCId, {
        title: 'Scoped job',
        occurrenceStart: '2026-10-28T16:00:00.000Z',
      });
      await assignToJob(seed, seriesCId, jobC.id, seed.readerUserId);

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

      // Scope "my events": all occurrences of series A (series-wide job) and
      // only the 2026-10-28 occurrence of series C (occurrence-scoped job).
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

      // The admin has no job assignments, so "my events" is empty for them.
      const adminMine = await getOccurrences(seed.adminToken, '&scope=mine');
      expect(adminMine).toHaveLength(0);
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

  describe('POST /api/v1/event-series/:seriesId/jobs', () => {
    it('creates series-wide and occurrence-scoped job slots', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);

      // Series-wide slot.
      const slot = await createJob(seed, series.id, {
        title: 'Setup crew',
        description: 'Arrive early',
      });
      expect(slot.occurrenceStart).toBeNull();

      // Occurrence-scoped slot.
      const scoped = await createJob(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      expect(scoped.occurrenceStart).toBe('2026-10-21T16:00:00.000Z');
    });

    it('rejects a job slot for a date that is not an occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/jobs`,
        headers: auth(seed.adminToken),
        payload: { title: 'Nope', occurrenceStart: '2026-10-22T16:00:00.000Z' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/event-series/:seriesId/jobs/:jobId/assignments', () => {
    it('assigns a user to a job slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createJob(seed, series.id, { title: 'Setup crew' });
      const assignment = await assignToJob(seed, series.id, slot.id, seed.readerUserId);
      expect(assignment.userName).toBe('Reader User');
    });

    it('rejects a duplicate assignment', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createJob(seed, series.id, { title: 'Setup crew' });
      await assignToJob(seed, series.id, slot.id, seed.readerUserId);
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/jobs/${slot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: seed.readerUserId },
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects an assignment for an unknown user', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createJob(seed, series.id, { title: 'Setup crew' });
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${series.id}/jobs/${slot.id}/assignments`,
        headers: auth(seed.adminToken),
        payload: { userId: randomUUID() },
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
      expect(seriesWide.occurrenceStart).toBeNull();

      const scoped = await createComment(
        seed,
        series.id,
        { body: 'Occurrence note', occurrenceStart: '2026-10-21T16:00:00.000Z' },
        seed.readerToken,
      );
      expect(scoped.userName).toBe('Reader User');
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
    it('includes the job slots of the occurrence', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      // The occurrence detail shows both slots, the scoped one only for its
      // occurrence.
      const setupSlot = await createJob(seed, series.id, {
        title: 'Setup crew',
        description: 'Arrive early',
      });
      await createJob(seed, series.id, {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      });
      await assignToJob(seed, series.id, setupSlot.id, seed.readerUserId);

      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-10-21T16:00:00.000Z')}`,
        headers: auth(seed.readerToken),
      });
      expect(detail.statusCode).toBe(200);
      const detailBody = detail.json() as {
        jobs: { id: number; title: string; assignments: { userName: string }[] }[];
      };
      expect(detailBody.jobs).toHaveLength(2);
      const setup = detailBody.jobs.find(j => j.title === 'Setup crew');
      expect(setup?.assignments.map(a => a.userName)).toEqual(['Reader User']);

      const other = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${series.id}/occurrences/${encodeURIComponent('2026-10-26T17:00:00.000Z')}`,
        headers: auth(seed.readerToken),
      });
      const otherJobs = (other.json() as { jobs: { title: string }[] }).jobs;
      expect(otherJobs.map(j => j.title)).toEqual(['Setup crew']);
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

  describe('PATCH /api/v1/event-series/:seriesId/jobs/:jobId', () => {
    it('updates a job slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createJob(seed, series.id, { title: 'Setup crew' });
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${series.id}/jobs/${slot.id}`,
        headers: auth(seed.adminToken),
        payload: { title: 'Setup crew (updated)' },
      });
      expect(response.statusCode).toBe(200);
      expect((response.json() as { title: string }).title).toBe('Setup crew (updated)');
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/jobs/:jobId/assignments/:assignmentId', () => {
    it('unassigns a user from a job slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createJob(seed, series.id, { title: 'Setup crew' });
      const assignment = await assignToJob(seed, series.id, slot.id, seed.readerUserId);
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/jobs/${slot.id}/assignments/${assignment.id}`,
        headers: auth(seed.adminToken),
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/jobs/:jobId', () => {
    it('deletes a job slot', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      const slot = await createJob(seed, series.id, { title: 'AV check' });
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${series.id}/jobs/${slot.id}`,
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
  });

  describe('DELETE /api/v1/event-series/:seriesId', () => {
    it('deletes a series with its jobs and comments', async () => {
      const seed = await createEventsFixture();
      const series = await createSeries(seed, weeklyPayload);
      await createJob(seed, series.id, { title: 'Setup crew' });
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

      const jobs = await db
        .selectFrom('event_jobs')
        .selectAll()
        .where('event_series_id', '=', series.id)
        .execute();
      expect(jobs).toHaveLength(0);
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
