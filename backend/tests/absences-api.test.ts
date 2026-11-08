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

// Integration tests for the absences API: self-service CRUD for the current
// user's absences, the absence mark on the simple user list, the active
// absence flag on team members, and the overlap handling (removing the user's
// assignments on overlapping event occurrences and notifying the event's
// managers). Every test resets the database (beforeEach) and rebuilds the
// fixture, so tests are independent.

interface AbsenceResponse {
  id: number;
  userId: string;
  type: string;
  description: string;
  startDate: string;
  endDate: string;
}

interface UserListItemResponse {
  id: string;
  name: string;
  hasAbsence: boolean;
}

interface TeamMemberResponse {
  id: number;
  userId: string;
  userName: string;
  isManager: boolean;
  hasActiveAbsence: boolean;
}

interface Seed {
  organizationId: string;
  calendarId: string;
  userId: string;
  token: string;
  otherUserId: string;
  otherToken: string;
}

async function seed(): Promise<Seed> {
  const suffix = randomUUID();
  const organizationId = await createOrganization(`Absence Org ${suffix}`, {
    defaultTimezone: 'UTC',
  });
  const calendarId = await createCalendar(organizationId, 'Calendar');
  const user = await createUser('Absent User');
  const other = await createUser('Other User');
  await addUserToOrganization(user.id, organizationId);
  await addUserToOrganization(other.id, organizationId);
  return {
    organizationId,
    calendarId,
    userId: user.id,
    token: user.token,
    otherUserId: other.id,
    otherToken: other.token,
  };
}

/** Creates a single-event series with one parent slot assigned to assigneeId. */
async function seedEventWithAssignment(
  seed: Seed,
  assigneeId: string,
  startIso: string,
): Promise<{ seriesId: number; slotId: number; assignmentId: number }> {
  const series = await db
    .insertInto('event_series')
    .values({
      title: 'Overlap Event',
      calendar_id: seed.calendarId,
      start: new Date(startIso),
      duration_minutes: 60,
      timezone: 'UTC',
      is_visible: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const slot = await db
    .insertInto('event_work_roles')
    .values({
      event_series_id: series.id,
      event_occurrence_id: null,
      title: 'Helper',
      is_critical: true,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  const assignment = await db
    .insertInto('event_work_role_assignments')
    .values({ event_work_role_id: slot.id, user_id: assigneeId })
    .returningAll()
    .executeTakeFirstOrThrow();
  return { seriesId: series.id, slotId: slot.id, assignmentId: assignment.id };
}

/** Connects a team to the series and makes leaderId/managerId its managers. */
async function seedTeamWithManagers(
  seed: Seed,
  seriesId: number,
  leaderId: string,
  managerId: string,
): Promise<string> {
  const team = await db
    .insertInto('teams')
    .values({
      name: `Team ${randomUUID()}`,
      organization_id: seed.organizationId,
      team_leader_id: leaderId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto('team_members')
    .values({ team_id: team.id, user_id: managerId, is_manager: true })
    .execute();
  await db
    .insertInto('event_series_teams')
    .values({ event_series_id: seriesId, team_id: team.id })
    .execute();
  return team.id;
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

describe('Absences API', () => {
  describe('GET /api/v1/users/@me/absences', () => {
    it('lists only the current user absences, optionally range-filtered', async () => {
      const seedData = await seed();
      // Absence in March, one in October.
      await db
        .insertInto('absences')
        .values({
          user_id: seedData.userId,
          type: 'sick',
          description: 'Flu',
          start_date: new Date('2026-03-10T00:00:00.000Z'),
          end_date: new Date('2026-03-12T00:00:00.000Z'),
        })
        .execute();
      await db
        .insertInto('absences')
        .values({
          user_id: seedData.userId,
          type: 'away',
          description: 'Vacation',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-25T00:00:00.000Z'),
        })
        .execute();
      // Another user's absence must not appear.
      await db
        .insertInto('absences')
        .values({
          user_id: seedData.otherUserId,
          type: 'other',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-25T00:00:00.000Z'),
        })
        .execute();

      const all = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
      });
      expect(all.statusCode).toBe(200);
      const allBody = all.json() as AbsenceResponse[];
      expect(allBody).toHaveLength(2);
      expect(allBody.every(a => a.userId === seedData.userId)).toBe(true);
      expect(allBody[0].startDate).toBe('2026-03-10');
      expect(allBody[1].endDate).toBe('2026-10-25');

      const filtered = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/absences?start=2026-10-01&end=2026-10-31',
        headers: auth(seedData.token),
      });
      expect(filtered.statusCode).toBe(200);
      const filteredBody = filtered.json() as AbsenceResponse[];
      expect(filteredBody).toHaveLength(1);
      expect(filteredBody[0].type).toBe('away');
    });

    it('returns 401 without a token', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/users/@me/absences' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/users/@me/absences', () => {
    it('creates an absence', async () => {
      const seedData = await seed();
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
        payload: {
          type: 'away',
          description: 'Trip',
          startDate: '2026-10-20',
          endDate: '2026-10-25',
        },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as AbsenceResponse;
      expect(body.userId).toBe(seedData.userId);
      expect(body.type).toBe('away');
      expect(body.description).toBe('Trip');
      expect(body.startDate).toBe('2026-10-20');
      expect(body.endDate).toBe('2026-10-25');
    });

    it('returns 400 when the end date is before the start date or the type is invalid', async () => {
      const seedData = await seed();
      const badRange = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
        payload: { type: 'away', startDate: '2026-10-25', endDate: '2026-10-20' },
      });
      expect(badRange.statusCode).toBe(400);
      const badType = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
        payload: { type: 'vacation', startDate: '2026-10-20', endDate: '2026-10-25' },
      });
      expect(badType.statusCode).toBe(400);
    });

    it('removes assignments on overlapping occurrences and notifies the event managers', async () => {
      const seedData = await seed();
      // Event on 2026-10-21 10:00-11:00 UTC, the user assigned to its only slot.
      const event = await seedEventWithAssignment(
        seedData,
        seedData.userId,
        '2026-10-21T10:00:00.000Z',
      );
      // A team connected to the series, with the other user as manager member
      // and the current user as leader (the leader is excluded from the
      // notification because they are the absent person).
      await seedTeamWithManagers(seedData, event.seriesId, seedData.userId, seedData.otherUserId);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
        payload: {
          type: 'sick',
          description: 'Flu',
          startDate: '2026-10-21',
          endDate: '2026-10-22',
        },
      });
      expect(response.statusCode).toBe(200);

      // The assignment is removed.
      const remaining = await db
        .selectFrom('event_work_role_assignments')
        .selectAll()
        .where('id', '=', event.assignmentId)
        .execute();
      expect(remaining).toHaveLength(0);

      // The manager member of the connected team got a notification.
      const notifications = await db
        .selectFrom('notifications')
        .selectAll()
        .where('user_id', '=', seedData.otherUserId)
        .execute();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Assignment removed due to absence');
      expect(notifications[0].body).toContain('Overlap Event');
      expect(notifications[0].organization_id).toBe(seedData.organizationId);

      // The absent user themself (team leader) is not notified.
      const ownNotifications = await db
        .selectFrom('notifications')
        .selectAll()
        .where('user_id', '=', seedData.userId)
        .execute();
      expect(ownNotifications).toHaveLength(0);
    });

    it('keeps assignments on occurrences outside the absence range', async () => {
      const seedData = await seed();
      const event = await seedEventWithAssignment(
        seedData,
        seedData.userId,
        '2026-10-21T10:00:00.000Z',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
        payload: { type: 'away', startDate: '2026-11-01', endDate: '2026-11-05' },
      });
      expect(response.statusCode).toBe(200);

      const remaining = await db
        .selectFrom('event_work_role_assignments')
        .selectAll()
        .where('id', '=', event.assignmentId)
        .execute();
      expect(remaining).toHaveLength(1);
    });

    it('removes assignments on recurring occurrences inside the range only', async () => {
      const seedData = await seed();
      // Weekly event on Wednesdays 10:00 UTC starting 2026-10-07.
      const series = await db
        .insertInto('event_series')
        .values({
          title: 'Weekly Meeting',
          calendar_id: seedData.calendarId,
          start: new Date('2026-10-07T10:00:00.000Z'),
          duration_minutes: 60,
          rrule: 'RRULE:FREQ=WEEKLY;BYDAY=WE',
          timezone: 'UTC',
          is_visible: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const slot = await db
        .insertInto('event_work_roles')
        .values({
          event_series_id: series.id,
          event_occurrence_id: null,
          title: 'Helper',
          is_critical: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const assignment = await db
        .insertInto('event_work_role_assignments')
        .values({ event_work_role_id: slot.id, user_id: seedData.userId })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Absence covering only 2026-10-21 (the third Wednesday).
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/users/@me/absences',
        headers: auth(seedData.token),
        payload: { type: 'other', startDate: '2026-10-21', endDate: '2026-10-21' },
      });
      expect(response.statusCode).toBe(200);

      // A series-wide slot covers every occurrence, so the single assignment
      // row (which applies to all occurrences) is removed.
      const remaining = await db
        .selectFrom('event_work_role_assignments')
        .selectAll()
        .where('id', '=', assignment.id)
        .execute();
      expect(remaining).toHaveLength(0);
    });
  });

  describe('PATCH /api/v1/users/@me/absences/:absenceId', () => {
    it('updates the current user absence', async () => {
      const seedData = await seed();
      const absence = await db
        .insertInto('absences')
        .values({
          user_id: seedData.userId,
          type: 'sick',
          description: 'Flu',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-21T00:00:00.000Z'),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/@me/absences/${absence.id}`,
        headers: auth(seedData.token),
        payload: { type: 'away', endDate: '2026-10-30' },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as AbsenceResponse;
      expect(body.type).toBe('away');
      expect(body.endDate).toBe('2026-10-30');
      expect(body.startDate).toBe('2026-10-20');
    });

    it('returns 404 for another user absence', async () => {
      const seedData = await seed();
      const absence = await db
        .insertInto('absences')
        .values({
          user_id: seedData.otherUserId,
          type: 'sick',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-21T00:00:00.000Z'),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/@me/absences/${absence.id}`,
        headers: auth(seedData.token),
        payload: { type: 'away' },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/users/@me/absences/:absenceId', () => {
    it('deletes the current user absence', async () => {
      const seedData = await seed();
      const absence = await db
        .insertInto('absences')
        .values({
          user_id: seedData.userId,
          type: 'sick',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-21T00:00:00.000Z'),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/@me/absences/${absence.id}`,
        headers: auth(seedData.token),
      });
      expect(response.statusCode).toBe(200);
      const remaining = await db
        .selectFrom('absences')
        .selectAll()
        .where('id', '=', absence.id)
        .execute();
      expect(remaining).toHaveLength(0);
    });

    it('returns 404 for another user absence', async () => {
      const seedData = await seed();
      const absence = await db
        .insertInto('absences')
        .values({
          user_id: seedData.otherUserId,
          type: 'sick',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-21T00:00:00.000Z'),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/users/@me/absences/${absence.id}`,
        headers: auth(seedData.token),
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/users/list', () => {
    it('marks users with an absence overlapping the given range', async () => {
      const seedData = await seed();
      await db
        .insertInto('absences')
        .values({
          user_id: seedData.userId,
          type: 'sick',
          start_date: new Date('2026-10-20T00:00:00.000Z'),
          end_date: new Date('2026-10-22T00:00:00.000Z'),
        })
        .execute();

      // Range overlapping the absence (event on 2026-10-21 10:00-11:00 UTC).
      const overlapping = await app.inject({
        method: 'GET',
        url: '/api/v1/users/list?start=2026-10-21T10:00:00.000Z&end=2026-10-21T11:00:00.000Z',
      });
      expect(overlapping.statusCode).toBe(200);
      const overlappingBody = overlapping.json() as UserListItemResponse[];
      const marked = overlappingBody.find(u => u.id === seedData.userId);
      const unmarked = overlappingBody.find(u => u.id === seedData.otherUserId);
      expect(marked?.hasAbsence).toBe(true);
      expect(unmarked?.hasAbsence).toBe(false);

      // Range outside the absence.
      const outside = await app.inject({
        method: 'GET',
        url: '/api/v1/users/list?start=2026-11-01T10:00:00.000Z&end=2026-11-01T11:00:00.000Z',
      });
      const outsideBody = outside.json() as UserListItemResponse[];
      expect(outsideBody.find(u => u.id === seedData.userId)?.hasAbsence).toBe(false);

      // Without a range, nobody is marked.
      const noRange = await app.inject({ method: 'GET', url: '/api/v1/users/list' });
      const noRangeBody = noRange.json() as UserListItemResponse[];
      expect(noRangeBody.every(u => u.hasAbsence === false)).toBe(true);
    });
  });

  describe('GET /api/v1/organizations/:organizationId/teams/:teamId/members', () => {
    it('flags members with a currently active absence', async () => {
      const seedData = await seed();
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      // Requester can read team management.
      const roleId = await createRole(seedData.organizationId, 'Reader', ['team-management:read']);
      await assignRole(seedData.userId, roleId);

      const team = await db
        .insertInto('teams')
        .values({ name: `Team ${randomUUID()}`, organization_id: seedData.organizationId })
        .returningAll()
        .executeTakeFirstOrThrow();
      await db
        .insertInto('team_members')
        .values({ team_id: team.id, user_id: seedData.userId })
        .execute();
      await db
        .insertInto('team_members')
        .values({ team_id: team.id, user_id: seedData.otherUserId })
        .execute();
      // Active absence for the other user (yesterday - tomorrow).
      await db
        .insertInto('absences')
        .values({
          user_id: seedData.otherUserId,
          type: 'away',
          start_date: new Date(`${yesterday}T00:00:00.000Z`),
          end_date: new Date(`${tomorrow}T00:00:00.000Z`),
        })
        .execute();
      // Expired absence for the current user (must not flag).
      await db
        .insertInto('absences')
        .values({
          user_id: seedData.userId,
          type: 'sick',
          start_date: new Date('2020-01-01T00:00:00.000Z'),
          end_date: new Date('2020-01-05T00:00:00.000Z'),
        })
        .execute();
      expect(today).not.toBe('2020-01-05');

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${team.id}/members`,
        headers: auth(seedData.token),
      });
      expect(response.statusCode).toBe(200);
      const body = response.json() as TeamMemberResponse[];
      expect(body.find(m => m.userId === seedData.otherUserId)?.hasActiveAbsence).toBe(true);
      expect(body.find(m => m.userId === seedData.userId)?.hasActiveAbsence).toBe(false);
    });
  });
});
