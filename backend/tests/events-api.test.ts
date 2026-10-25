import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';

// Integration test for the event series API: seeds an organization (with a
// default timezone), a calendar and users, then exercises the whole rrule
// based system end to end: series CRUD, occurrence expansion (including far
// into the future), per-occurrence cancel/reschedule, job slots with user
// assignments, and comments. Skipped when the database is not available.

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

async function seed(): Promise<Seed> {
  const organizationId = randomUUID();
  const calendarId = randomUUID();
  const adminUserId = randomUUID();
  const readerUserId = randomUUID();
  const memberUserId = randomUUID();
  const suffix = randomUUID();

  await db
    .insertInto('organizations')
    .values({
      id: organizationId,
      name: `Events Test Org ${suffix}`,
      default_timezone: 'Europe/Berlin',
    })
    .execute();

  await db
    .insertInto('calendars')
    .values({ id: calendarId, name: 'Main Calendar', organization_id: organizationId })
    .execute();

  await db
    .insertInto('users')
    .values([
      { id: adminUserId, name: 'Admin User', email: `admin-${suffix}@example.com` },
      { id: readerUserId, name: 'Reader User', email: `reader-${suffix}@example.com` },
      { id: memberUserId, name: 'Member User', email: `member-${suffix}@example.com` },
    ])
    .execute();

  await db
    .insertInto('user_organizations')
    .values([
      { user_id: adminUserId, organization_id: organizationId },
      { user_id: readerUserId, organization_id: organizationId },
      { user_id: memberUserId, organization_id: organizationId },
    ])
    .execute();

  const adminToken = randomUUID();
  const readerToken = randomUUID();
  const memberToken = randomUUID();
  await db
    .insertInto('access_tokens')
    .values([
      { user_id: adminUserId, token: adminToken },
      { user_id: readerUserId, token: readerToken },
      { user_id: memberUserId, token: memberToken },
    ])
    .execute();

  const permissionRows = await db
    .selectFrom('permissions')
    .select(['id', 'code'])
    .where('code', 'in', ['admin', 'events:read', 'events:write'])
    .execute();
  const permissionId = (code: string) => {
    const row = permissionRows.find(r => r.code === code);
    if (!row) throw new Error(`Permission ${code} not seeded!`);
    return row.id;
  };

  const adminRole = await db
    .insertInto('roles')
    .values({ organization_id: organizationId, name: 'Admin Role' })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto('role_permissions')
    .values({ role_id: adminRole.id, permission_id: permissionId('admin') })
    .execute();
  await db
    .insertInto('user_roles')
    .values({ user_id: adminUserId, role_id: adminRole.id })
    .execute();

  const readerRole = await db
    .insertInto('roles')
    .values({ organization_id: organizationId, name: 'Event Reader Role' })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto('role_permissions')
    .values([
      { role_id: readerRole.id, permission_id: permissionId('events:read') },
      { role_id: readerRole.id, permission_id: permissionId('events:write') },
    ])
    .execute();
  await db
    .insertInto('user_roles')
    .values({ user_id: readerUserId, role_id: readerRole.id })
    .execute();

  return {
    organizationId,
    calendarId,
    adminUserId,
    adminToken,
    readerUserId,
    readerToken,
    memberUserId,
    memberToken,
  };
}

async function cleanup(seedData: Seed): Promise<void> {
  await db
    .deleteFrom('users')
    .where('id', 'in', [seedData.adminUserId, seedData.readerUserId, seedData.memberUserId])
    .execute();
  await db.deleteFrom('roles').where('organization_id', '=', seedData.organizationId).execute();
  await db.deleteFrom('organizations').where('id', '=', seedData.organizationId).execute();
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

describe('Events API', () => {
  let app: FastifyInstance;
  let seedData: Seed | null = null;
  let seriesId = 0;
  let dailySeriesId = 0;

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

  it('returns 401 without a token', async () => {
    if (!seedData) return;
    const response = await app.inject({ method: 'GET', url: '/api/v1/event-series' });
    expect(response.statusCode).toBe(401);
  });

  it('returns 403 for a member without events:read', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/event-series',
      headers: auth(seedData.memberToken),
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns 403 for a member without events:write', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/event-series',
      headers: auth(seedData.memberToken),
      payload: {
        title: 'Member Series',
        calendarId: seedData.calendarId,
        start: '2026-10-21T16:00:00.000Z',
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it('creates a recurring series, inheriting the organization default timezone', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/event-series',
      headers: auth(seedData.adminToken),
      payload: {
        title: 'Weekly sync',
        description: 'Every Monday and Wednesday',
        calendarId: seedData.calendarId,
        start: '2026-10-21T16:00:00.000Z', // Wednesday 18:00 Europe/Berlin
        durationMinutes: 60,
        recurrence: { freq: 'WEEKLY', byWeekdays: [1, 3] },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as EventSeriesResponse;
    seriesId = body.id;
    expect(body.title).toBe('Weekly sync');
    expect(body.timezone).toBe('Europe/Berlin');
    expect(body.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
    expect(body.recurrence).toEqual({ freq: 'WEEKLY', byWeekdays: [1, 3] });
    expect(body.durationMinutes).toBe(60);
  });

  it('creates a series with an explicit timezone', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/event-series',
      headers: auth(seedData.adminToken),
      payload: {
        title: 'Daily standup',
        calendarId: seedData.calendarId,
        start: '2026-01-01T09:00:00.000Z',
        durationMinutes: 30,
        timezone: 'UTC',
        recurrence: { freq: 'DAILY' },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as EventSeriesResponse;
    dailySeriesId = body.id;
    expect(body.timezone).toBe('UTC');
    expect(body.rrule).toBe('RRULE:FREQ=DAILY');
  });

  it('rejects an unknown timezone', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/event-series',
      headers: auth(seedData.adminToken),
      payload: {
        title: 'Bad tz',
        calendarId: seedData.calendarId,
        start: '2026-10-21T16:00:00.000Z',
        timezone: 'Not/AZone',
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it('rejects an unknown calendar', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/event-series',
      headers: auth(seedData.adminToken),
      payload: {
        title: 'Bad calendar',
        calendarId: randomUUID(),
        start: '2026-10-21T16:00:00.000Z',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('lists and reads series', async () => {
    if (!seedData) return;
    const list = await app.inject({
      method: 'GET',
      url: '/api/v1/event-series',
      headers: auth(seedData.adminToken),
    });
    expect(list.statusCode).toBe(200);
    expect((list.json() as EventSeriesResponse[]).length).toBeGreaterThanOrEqual(2);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}`,
      headers: auth(seedData.adminToken),
    });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as EventSeriesResponse).id).toBe(seriesId);
  });

  it('expands occurrences of all series in a range with DST-correct instants', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z',
      headers: auth(seedData.readerToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as OccurrenceResponse[];
    const weekly = body.filter(o => o.seriesId === seriesId);
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
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/event-series/occurrences?start=2036-06-01T00:00:00.000Z&end=2036-07-01T00:00:00.000Z',
      headers: auth(seedData.readerToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as OccurrenceResponse[];
    // The daily standup series (created above, UTC) has 30 occurrences in June 2036.
    const daily = body.filter(o => o.seriesId === dailySeriesId);
    expect(daily).toHaveLength(30);
    expect(daily[0].start).toBe('2036-06-01T09:00:00.000Z');
    expect(daily[29].start).toBe('2036-06-30T09:00:00.000Z');
  });

  it('rejects occurrence ranges over 10 years', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/event-series/occurrences?start=2026-01-01T00:00:00.000Z&end=2040-01-01T00:00:00.000Z',
      headers: auth(seedData.readerToken),
    });
    expect(response.statusCode).toBe(400);
  });

  it('filters occurrences by location, team and scope', async () => {
    if (!seedData) return;
    const seed = seedData;
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

    const locationAId = randomUUID();
    const locationBId = randomUUID();
    await db
      .insertInto('locations')
      .values([
        {
          id: locationAId,
          name: `Location A ${suffix}`,
          description: '',
          organization_id: seed.organizationId,
        },
        {
          id: locationBId,
          name: `Location B ${suffix}`,
          description: '',
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

    const createSeries = async (title: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/event-series',
        headers: auth(seed.adminToken),
        payload: {
          title,
          calendarId,
          start: '2026-10-21T16:00:00.000Z', // Wednesday 16:00 UTC
          durationMinutes: 60,
          timezone: 'UTC',
          recurrence: { freq: 'WEEKLY', byWeekdays: [3] },
        },
      });
      expect(response.statusCode).toBe(200);
      return (response.json() as EventSeriesResponse).id;
    };

    // Series A: location A, team A. Series B: location B, team B. Series C:
    // location A, no team.
    const seriesAId = await createSeries(`Filter series A ${suffix}`);
    const seriesBId = await createSeries(`Filter series B ${suffix}`);
    const seriesCId = await createSeries(`Filter series C ${suffix}`);
    const mySeriesIds = [seriesAId, seriesBId, seriesCId];

    const configure = async (id: number, locationId: string, teamIds: string[]) => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${id}/config`,
        headers: auth(seed.adminToken),
        payload: { locationId, teamIds },
      });
      expect(response.statusCode).toBe(200);
    };
    await configure(seriesAId, locationAId, [teamAId]);
    await configure(seriesBId, locationBId, [teamBId]);
    await configure(seriesCId, locationAId, []);

    // The reader is assigned to a series-wide job on series A (covering all
    // its occurrences) and to an occurrence-scoped job on series C.
    const jobA = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesAId}/jobs`,
      headers: auth(seed.adminToken),
      payload: { title: 'Series-wide job' },
    });
    expect(jobA.statusCode).toBe(200);
    const assignedA = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesAId}/jobs/${(jobA.json() as { id: number }).id}/assignments`,
      headers: auth(seed.adminToken),
      payload: { userId: seed.readerUserId },
    });
    expect(assignedA.statusCode).toBe(200);

    const jobC = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesCId}/jobs`,
      headers: auth(seed.adminToken),
      payload: { title: 'Scoped job', occurrenceStart: '2026-10-28T16:00:00.000Z' },
    });
    expect(jobC.statusCode).toBe(200);
    const assignedC = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesCId}/jobs/${(jobC.json() as { id: number }).id}/assignments`,
      headers: auth(seed.adminToken),
      payload: { userId: seed.readerUserId },
    });
    expect(assignedC.statusCode).toBe(200);

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

    // Location filter.
    const byLocation = await getOccurrences(seed.readerToken, `&locationId=${locationAId}`);
    expect(seriesIdsOf(byLocation)).toEqual([seriesAId, seriesCId]);

    // Team filter.
    const byTeam = await getOccurrences(seed.readerToken, `&teamId=${teamAId}`);
    expect(seriesIdsOf(byTeam)).toEqual([seriesAId]);

    // Combined location + team filter.
    const combined = await getOccurrences(
      seed.readerToken,
      `&locationId=${locationAId}&teamId=${teamAId}`,
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

  it('cancels an occurrence', async () => {
    if (!seedData) return;
    const occurrenceStart = encodeURIComponent('2026-10-28T17:00:00.000Z');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/cancel`,
      headers: auth(seedData.adminToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as ExceptionResponse;
    expect(body.isCancelled).toBe(true);
    expect(body.occurrenceStart).toBe('2026-10-28T17:00:00.000Z');

    // The occurrence no longer shows up in range expansion...
    const occurrences = await app.inject({
      method: 'GET',
      url: '/api/v1/event-series/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z',
      headers: auth(seedData.readerToken),
    });
    const weekly = (occurrences.json() as OccurrenceResponse[]).filter(
      o => o.seriesId === seriesId,
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
      url: `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}`,
      headers: auth(seedData.readerToken),
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().occurrence.isCancelled).toBe(true);
  });

  it('rejects cancelling a date that is not an occurrence', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent('2026-10-22T16:00:00.000Z')}/cancel`,
      headers: auth(seedData.adminToken),
    });
    expect(response.statusCode).toBe(404);
  });

  it('reschedules an occurrence', async () => {
    if (!seedData) return;
    const occurrenceStart = encodeURIComponent('2026-11-02T17:00:00.000Z');
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/reschedule`,
      headers: auth(seedData.adminToken),
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
      headers: auth(seedData.readerToken),
    });
    const weekly = (occurrences.json() as OccurrenceResponse[]).filter(
      o => o.seriesId === seriesId,
    );
    const moved = weekly.find(o => o.occurrenceStart === '2026-11-02T17:00:00.000Z');
    expect(moved).toBeDefined();
    expect(moved?.start).toBe('2026-11-03T10:00:00.000Z');
    expect(moved?.isRescheduled).toBe(true);
    expect(weekly.some(o => o.start === '2026-11-02T17:00:00.000Z')).toBe(false);
  });

  it('restores an occurrence when its exception is deleted', async () => {
    if (!seedData) return;
    const occurrenceStart = encodeURIComponent('2026-10-28T17:00:00.000Z');
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/exception`,
      headers: auth(seedData.adminToken),
    });
    expect(response.statusCode).toBe(200);

    const occurrences = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/occurrences?start=2026-10-21T00:00:00.000Z&end=2026-11-05T00:00:00.000Z`,
      headers: auth(seedData.readerToken),
    });
    const starts = (occurrences.json() as OccurrenceResponse[]).map(o => o.start);
    expect(starts).toContain('2026-10-28T17:00:00.000Z');
  });

  it('manages job slots and assigns users', async () => {
    if (!seedData) return;
    // Series-wide slot.
    const slot = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/jobs`,
      headers: auth(seedData.adminToken),
      payload: { title: 'Setup crew', description: 'Arrive early' },
    });
    expect(slot.statusCode).toBe(200);
    const slotBody = slot.json() as { id: number; occurrenceStart: string | null };
    expect(slotBody.occurrenceStart).toBeNull();

    // Occurrence-scoped slot.
    const scoped = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/jobs`,
      headers: auth(seedData.adminToken),
      payload: {
        title: 'AV check',
        occurrenceStart: '2026-10-21T16:00:00.000Z',
      },
    });
    expect(scoped.statusCode).toBe(200);
    expect((scoped.json() as { occurrenceStart: string | null }).occurrenceStart).toBe(
      '2026-10-21T16:00:00.000Z',
    );

    // Scoped slot for a date that is not an occurrence.
    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/jobs`,
      headers: auth(seedData.adminToken),
      payload: { title: 'Nope', occurrenceStart: '2026-10-22T16:00:00.000Z' },
    });
    expect(bad.statusCode).toBe(404);

    // Assign a user.
    const assigned = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/jobs/${slotBody.id}/assignments`,
      headers: auth(seedData.adminToken),
      payload: { userId: seedData.readerUserId },
    });
    expect(assigned.statusCode).toBe(200);
    const assignment = assigned.json() as { id: number; userName: string };
    expect(assignment.userName).toBe('Reader User');

    // Duplicate assignment is rejected.
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/jobs/${slotBody.id}/assignments`,
      headers: auth(seedData.adminToken),
      payload: { userId: seedData.readerUserId },
    });
    expect(duplicate.statusCode).toBe(400);

    // Unknown user is rejected.
    const unknown = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/jobs/${slotBody.id}/assignments`,
      headers: auth(seedData.adminToken),
      payload: { userId: randomUUID() },
    });
    expect(unknown.statusCode).toBe(404);

    // The occurrence detail shows both slots, the scoped one only for its occurrence.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent('2026-10-21T16:00:00.000Z')}`,
      headers: auth(seedData.readerToken),
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
      url: `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent('2026-10-26T17:00:00.000Z')}`,
      headers: auth(seedData.readerToken),
    });
    const otherJobs = (other.json() as { jobs: { title: string }[] }).jobs;
    expect(otherJobs.map(j => j.title)).toEqual(['Setup crew']);

    // Update the slot, then unassign the user.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/event-series/${seriesId}/jobs/${slotBody.id}`,
      headers: auth(seedData.adminToken),
      payload: { title: 'Setup crew (updated)' },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { title: string }).title).toBe('Setup crew (updated)');

    const unassigned = await app.inject({
      method: 'DELETE',
      url: `/api/v1/event-series/${seriesId}/jobs/${slotBody.id}/assignments/${assignment.id}`,
      headers: auth(seedData.adminToken),
    });
    expect(unassigned.statusCode).toBe(200);

    // Delete the occurrence-scoped slot.
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/event-series/${seriesId}/jobs/${(scoped.json() as { id: number }).id}`,
      headers: auth(seedData.adminToken),
    });
    expect(deleted.statusCode).toBe(200);
  });

  it('manages comments on series and occurrences', async () => {
    if (!seedData) return;
    const seriesWide = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/comments`,
      headers: auth(seedData.adminToken),
      payload: { body: 'Series-wide note' },
    });
    expect(seriesWide.statusCode).toBe(200);
    const seriesComment = seriesWide.json() as {
      id: number;
      userName: string;
      occurrenceStart: string | null;
    };
    expect(seriesComment.userName).toBe('Admin User');
    expect(seriesComment.occurrenceStart).toBeNull();

    const scoped = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/comments`,
      headers: auth(seedData.readerToken),
      payload: { body: 'Occurrence note', occurrenceStart: '2026-10-21T16:00:00.000Z' },
    });
    expect(scoped.statusCode).toBe(200);
    const occurrenceComment = scoped.json() as { id: number; userName: string };
    expect(occurrenceComment.userName).toBe('Reader User');

    // Comment for a date that is not an occurrence.
    const bad = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/comments`,
      headers: auth(seedData.adminToken),
      payload: { body: 'Nope', occurrenceStart: '2026-10-22T16:00:00.000Z' },
    });
    expect(bad.statusCode).toBe(404);

    // The occurrence detail includes both comments.
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent('2026-10-21T16:00:00.000Z')}`,
      headers: auth(seedData.readerToken),
    });
    const comments = (detail.json() as { comments: { body: string }[] }).comments;
    expect(comments.map(c => c.body)).toEqual(['Series-wide note', 'Occurrence note']);

    // Only the author can edit a comment.
    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/api/v1/event-series/${seriesId}/comments/${occurrenceComment.id}`,
      headers: auth(seedData.adminToken),
      payload: { body: 'Hijacked' },
    });
    expect(forbidden.statusCode).toBe(403);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/event-series/${seriesId}/comments/${occurrenceComment.id}`,
      headers: auth(seedData.readerToken),
      payload: { body: 'Occurrence note (edited)' },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as { body: string }).body).toBe('Occurrence note (edited)');

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/event-series/${seriesId}/comments/${seriesComment.id}`,
      headers: auth(seedData.adminToken),
    });
    expect(deleted.statusCode).toBe(200);
  });

  it('drops exceptions when the recurrence changes', async () => {
    if (!seedData) return;
    // Create an exception.
    const occurrenceStart = encodeURIComponent('2026-10-26T17:00:00.000Z');
    await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/occurrences/${occurrenceStart}/cancel`,
      headers: auth(seedData.adminToken),
    });
    let exceptions = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/exceptions`,
      headers: auth(seedData.readerToken),
    });
    expect((exceptions.json() as ExceptionResponse[]).length).toBeGreaterThanOrEqual(1);

    // Change the recurrence.
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/event-series/${seriesId}`,
      headers: auth(seedData.adminToken),
      payload: { recurrence: { freq: 'DAILY' } },
    });
    expect(updated.statusCode).toBe(200);
    expect((updated.json() as EventSeriesResponse).rrule).toBe('RRULE:FREQ=DAILY');

    exceptions = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/exceptions`,
      headers: auth(seedData.readerToken),
    });
    expect(exceptions.json() as ExceptionResponse[]).toHaveLength(0);
  });

  it('deletes a series with its jobs and comments', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/event-series/${seriesId}`,
      headers: auth(seedData.adminToken),
    });
    expect(response.statusCode).toBe(200);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}`,
      headers: auth(seedData.adminToken),
    });
    expect(detail.statusCode).toBe(404);

    const jobs = await db
      .selectFrom('event_jobs')
      .selectAll()
      .where('event_series_id', '=', seriesId)
      .execute();
    expect(jobs).toHaveLength(0);
    const comments = await db
      .selectFrom('event_comments')
      .selectAll()
      .where('event_series_id', '=', seriesId)
      .execute();
    expect(comments).toHaveLength(0);
  });
});

describe('Calendars API', () => {
  let app: FastifyInstance;
  let seedData: Seed | null = null;
  let createdCalendarId: string | null = null;

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
    if (seedData) {
      if (createdCalendarId) {
        await db
          .deleteFrom('calendars')
          .where('id', '=', createdCalendarId)
          .execute()
          .catch(() => {});
      }
      await cleanup(seedData).catch(() => {});
    }
    await app.close();
  });

  it('lists calendars for a user with events:read', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/calendars',
      headers: auth(seedData.readerToken),
    });
    expect(response.statusCode).toBe(200);
    const calendars = response.json() as Array<{
      id: string;
      name: string;
      organizationId: string;
    }>;
    const expectedCalendarId = seedData.calendarId;
    expect(calendars.some(calendar => calendar.id === expectedCalendarId)).toBe(true);
  });

  it('creates a calendar and rejects duplicate Google Calendar IDs', async () => {
    if (!seedData) return;
    const googleCalendarId = `gcal-${randomUUID()}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/calendars',
      headers: auth(seedData.adminToken),
      payload: {
        name: 'Second Calendar',
        organizationId: seedData.organizationId,
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
    expect(calendar.organizationId).toBe(seedData.organizationId);
    expect(calendar.googleCalendarId).toBe(googleCalendarId);
    createdCalendarId = calendar.id;

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/calendars',
      headers: auth(seedData.adminToken),
      payload: {
        name: 'Duplicate Calendar',
        organizationId: seedData.organizationId,
        googleCalendarId,
      },
    });
    expect(duplicate.statusCode).toBe(400);
  });

  it('returns 404 when creating a calendar for an unknown organization', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/calendars',
      headers: auth(seedData.adminToken),
      payload: { name: 'Orphan Calendar', organizationId: randomUUID() },
    });
    expect(response.statusCode).toBe(404);
  });

  it('returns 403 for a member without events:write', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/calendars',
      headers: auth(seedData.memberToken),
      payload: { name: 'Forbidden Calendar', organizationId: seedData.organizationId },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe('Organizations API', () => {
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

  it('lists the organizations the current user belongs to', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/organizations',
      headers: auth(seedData.readerToken),
    });
    expect(response.statusCode).toBe(200);
    const organizations = response.json() as Array<{
      id: string;
      name: string;
      defaultTimezone: string;
    }>;
    const expectedOrganizationId = seedData.organizationId;
    const own = organizations.find(organization => organization.id === expectedOrganizationId);
    expect(own).toBeDefined();
    expect(own?.defaultTimezone).toBe('Europe/Berlin');
  });
});

describe('Split series (edit this and all following)', () => {
  let app: FastifyInstance;
  let seedData: Seed | null = null;

  let weeklyId = 0;
  let oneOffId = 0;
  let dailyId = 0;
  let reanchorId = 0;

  const auth = (token: string) => ({ 'x-token': token });

  const createSeries = async (payload: Record<string, unknown>): Promise<EventSeriesResponse> => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/event-series',
      headers: auth((seedData as Seed).adminToken),
      payload: { calendarId: (seedData as Seed).calendarId, ...payload },
    });
    expect(response.statusCode).toBe(200);
    return response.json() as EventSeriesResponse;
  };

  const occurrencesOf = async (
    seriesId: number,
    start: string,
    end: string,
  ): Promise<OccurrenceResponse[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/occurrences?start=${start}&end=${end}`,
      headers: auth((seedData as Seed).readerToken),
    });
    expect(response.statusCode).toBe(200);
    return response.json() as OccurrenceResponse[];
  };

  const exceptionsOf = async (seriesId: number): Promise<ExceptionResponse[]> => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seriesId}/exceptions`,
      headers: auth((seedData as Seed).readerToken),
    });
    expect(response.statusCode).toBe(200);
    return response.json() as ExceptionResponse[];
  };

  const split = async (
    seriesId: number,
    occurrenceStart: string,
    payload: Record<string, unknown>,
    token?: string,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}/split`,
      headers: auth(token ?? (seedData as Seed).adminToken),
      payload,
    });

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    try {
      seedData = await seed();
    } catch {
      seedData = null;
      return;
    }
    // Weekly Mon+Wed 10:00 UTC series.
    weeklyId = (
      await createSeries({
        title: 'Weekly sync',
        start: '2026-10-26T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        recurrence: { freq: 'WEEKLY', byWeekdays: [1, 3] },
      })
    ).id;
    // One-off series.
    oneOffId = (
      await createSeries({ title: 'One-off', start: '2026-12-01T10:00:00.000Z', timezone: 'UTC' })
    ).id;
    // Daily series for the first-occurrence case.
    dailyId = (
      await createSeries({
        title: 'Daily',
        start: '2026-11-01T10:00:00.000Z',
        durationMinutes: 30,
        timezone: 'UTC',
        recurrence: { freq: 'DAILY' },
      })
    ).id;
    // Weekly series for the re-anchoring case.
    reanchorId = (
      await createSeries({
        title: 'Reanchor',
        start: '2026-10-26T10:00:00.000Z',
        durationMinutes: 60,
        timezone: 'UTC',
        recurrence: { freq: 'WEEKLY', byWeekdays: [1, 3] },
      })
    ).id;
  });

  afterAll(async () => {
    if (seedData) await cleanup(seedData).catch(() => {});
    await app.close();
  });

  it('splits a series: the new series continues, the original is truncated, exceptions reset', async () => {
    if (!seedData) return;
    // Past exception (before the split point) and future exception (after it).
    const cancelPast = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${weeklyId}/occurrences/${encodeURIComponent('2026-11-02T10:00:00.000Z')}/cancel`,
      headers: auth(seedData.adminToken),
      payload: {},
    });
    expect(cancelPast.statusCode).toBe(200);
    const cancelFuture = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${weeklyId}/occurrences/${encodeURIComponent('2026-11-09T10:00:00.000Z')}/cancel`,
      headers: auth(seedData.adminToken),
      payload: {},
    });
    expect(cancelFuture.statusCode).toBe(200);

    const response = await split(weeklyId, '2026-11-04T10:00:00.000Z', {
      title: 'Weekly sync (evening)',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as EventSeriesResponse;
    const newId = body.id;
    expect(newId).not.toBe(weeklyId);
    expect(body.title).toBe('Weekly sync (evening)');
    expect(body.start).toBe('2026-11-04T10:00:00.000Z');
    expect(body.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');

    // The original series is truncated just before the split occurrence.
    const original = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${weeklyId}`,
      headers: auth(seedData.adminToken),
    });
    expect((original.json() as EventSeriesResponse).rrule).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261104T095959Z',
    );

    // Original: only occurrences before the split point (the cancelled one is
    // hidden), and the past exception survives.
    const originalOccurrences = await occurrencesOf(
      weeklyId,
      '2026-10-26T00:00:00.000Z',
      '2026-11-04T00:00:00.000Z',
    );
    expect(originalOccurrences.map(o => o.occurrenceStart)).toEqual([
      '2026-10-26T10:00:00.000Z',
      '2026-10-28T10:00:00.000Z',
    ]);
    const exceptions = await exceptionsOf(weeklyId);
    expect(exceptions.map(e => e.occurrenceStart)).toEqual(['2026-11-02T10:00:00.000Z']);

    // New series: occurrences from the split point on, with the future
    // exception reset (nothing cancelled).
    const newOccurrences = await occurrencesOf(
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
    expect(await exceptionsOf(newId)).toEqual([]);
  });

  it('does not cascade later edits of the original series to the new series', async () => {
    if (!seedData) return;
    const newId = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/event-series',
        headers: auth(seedData.readerToken),
      })
    ).json() as EventSeriesResponse[];
    const splitSeries = newId.find(s => s.title === 'Weekly sync (evening)');
    expect(splitSeries).toBeDefined();

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/event-series/${weeklyId}`,
      headers: auth(seedData.adminToken),
      payload: { title: 'Original renamed' },
    });
    expect(updated.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${splitSeries?.id}`,
      headers: auth(seedData.readerToken),
    });
    expect((after.json() as EventSeriesResponse).title).toBe('Weekly sync (evening)');
  });

  it('splitting at the first occurrence updates the series in place and resets exceptions', async () => {
    if (!seedData) return;
    const cancel = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${dailyId}/occurrences/${encodeURIComponent('2026-11-03T10:00:00.000Z')}/cancel`,
      headers: auth(seedData.adminToken),
      payload: {},
    });
    expect(cancel.statusCode).toBe(200);

    const response = await split(dailyId, '2026-11-01T10:00:00.000Z', { title: 'Renamed daily' });
    expect(response.statusCode).toBe(200);
    const body = response.json() as EventSeriesResponse;
    expect(body.id).toBe(dailyId);
    expect(body.title).toBe('Renamed daily');
    expect(body.rrule).toBe('RRULE:FREQ=DAILY');

    // All exceptions are reset (the split occurrence was the first).
    expect(await exceptionsOf(dailyId)).toEqual([]);
    const occurrences = await occurrencesOf(
      dailyId,
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
    if (!seedData) return;
    const response = await split(oneOffId, '2026-12-01T10:00:00.000Z', {
      title: 'One-off renamed',
      durationMinutes: 90,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as EventSeriesResponse;
    expect(body.id).toBe(oneOffId);
    expect(body.title).toBe('One-off renamed');
    expect(body.rrule).toBeNull();
    expect(body.durationMinutes).toBe(90);
    expect(body.start).toBe('2026-12-01T10:00:00.000Z');
  });

  it('re-anchors an inherited recurrence so the new start is an occurrence', async () => {
    if (!seedData) return;
    // Split at the Wednesday occurrence but move the new series to a Thursday.
    const response = await split(reanchorId, '2026-10-28T10:00:00.000Z', {
      start: '2026-10-29T10:00:00.000Z',
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as EventSeriesResponse;
    expect(body.id).not.toBe(reanchorId);
    expect(body.start).toBe('2026-10-29T10:00:00.000Z');
    expect(body.rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,TH');

    // The original series is truncated just before the split occurrence.
    const original = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${reanchorId}`,
      headers: auth(seedData.adminToken),
    });
    expect((original.json() as EventSeriesResponse).rrule).toBe(
      'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261028T095959Z',
    );
    const originalOccurrences = await occurrencesOf(
      reanchorId,
      '2026-10-26T00:00:00.000Z',
      '2026-10-29T00:00:00.000Z',
    );
    expect(originalOccurrences.map(o => o.occurrenceStart)).toEqual(['2026-10-26T10:00:00.000Z']);

    // The new series contains the new Thursday start and continues Mon/Wed/Thu.
    const newOccurrences = await occurrencesOf(
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
    if (!seedData) return;
    const response = await split(weeklyId, '2026-10-28T10:00:00.000Z', {
      start: '2026-10-29T10:00:00.000Z', // a Thursday
      recurrence: { freq: 'WEEKLY', byWeekdays: [1] }, // Mondays only
    });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when the split point is not an occurrence of the series', async () => {
    if (!seedData) return;
    // 2026-10-27 is a Tuesday; the series repeats on Mondays and Wednesdays.
    const response = await split(weeklyId, '2026-10-27T10:00:00.000Z', { title: 'Nope' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 403 for a member without events:write', async () => {
    if (!seedData) return;
    const response = await split(
      weeklyId,
      '2026-10-28T10:00:00.000Z',
      { title: 'Nope' },
      seedData.memberToken,
    );
    expect(response.statusCode).toBe(403);
  });
});
