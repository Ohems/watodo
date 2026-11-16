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

// Integration tests for the team endpoints, focused on the team links
// (team leader, assigned work roles, assigned event series) and the
// event types list endpoint. Every test resets the database (beforeEach) and
// rebuilds the fixture, so tests are independent.

interface Seed {
  organizationId: string;
  otherOrganizationId: string;
  adminToken: string;
  writerToken: string;
  readerToken: string;
  outsiderToken: string;
  leaderId: string;
  managerId: string;
  managerToken: string;
  plainMemberId: string;
  plainMemberToken: string;
  eventTypeId: number;
  eventSeriesId: number;
  otherEventSeriesId: number;
  workRoleId: number;
  workRole2Id: number;
  otherWorkRoleId: number;
}

async function seed(): Promise<Seed> {
  const organizationId = await createOrganization(`Teams API Test ${randomUUID()}`);
  const otherOrganizationId = await createOrganization(`Other Org ${randomUUID()}`);

  const admin = await createUser('Teams Admin');
  const writer = await createUser('Teams Writer');
  const reader = await createUser('Teams Reader');
  const outsider = await createUser('Teams Outsider');
  const leader = await createUser('Team Leader');
  // A manager candidate and a plain member: both have no team-management
  // permissions, only events:read.
  const manager = await createUser('Team Manager');
  const plainMember = await createUser('Plain Member');

  for (const user of [admin, writer, reader, leader, manager, plainMember]) {
    await addUserToOrganization(user.id, organizationId);
  }
  await addUserToOrganization(outsider.id, otherOrganizationId);

  const adminRoleId = await createRole(organizationId, 'Admin', ['admin']);
  const writerRoleId = await createRole(organizationId, 'Writer', ['team-management:write']);
  const readerRoleId = await createRole(organizationId, 'Reader', [
    'team-management:read',
    'events:read',
  ]);
  const memberRoleId = await createRole(organizationId, 'Member', ['events:read']);
  const outsiderRoleId = await createRole(otherOrganizationId, 'Outsider', ['events:read']);

  await assignRole(admin.id, adminRoleId);
  await assignRole(writer.id, writerRoleId);
  await assignRole(reader.id, readerRoleId);
  await assignRole(manager.id, memberRoleId);
  await assignRole(plainMember.id, memberRoleId);
  await assignRole(outsider.id, outsiderRoleId);

  const calendarId = await createCalendar(organizationId, 'Main Calendar');
  const otherCalendarId = await createCalendar(otherOrganizationId, 'Other Calendar');
  const eventType = await db
    .insertInto('event_types')
    .values({ name: 'Weekly Meeting', calendar_id: calendarId })
    .returning('id')
    .executeTakeFirstOrThrow();
  const eventSeries = await db
    .insertInto('event_series')
    .values({
      title: 'Weekly Meeting',
      calendar_id: calendarId,
      start: new Date(),
      duration_minutes: 60,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const otherEventSeries = await db
    .insertInto('event_series')
    .values({
      title: 'Other Meeting',
      calendar_id: otherCalendarId,
      start: new Date(),
      duration_minutes: 60,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
  const workRole = await db
    .insertInto('work_roles')
    .values({ name: 'Setup', organization_id: organizationId })
    .returning('id')
    .executeTakeFirstOrThrow();
  const workRole2 = await db
    .insertInto('work_roles')
    .values({ name: 'Cleanup', organization_id: organizationId })
    .returning('id')
    .executeTakeFirstOrThrow();
  const otherWorkRole = await db
    .insertInto('work_roles')
    .values({ name: 'Other Role', organization_id: otherOrganizationId })
    .returning('id')
    .executeTakeFirstOrThrow();

  return {
    organizationId,
    otherOrganizationId,
    adminToken: admin.token,
    writerToken: writer.token,
    readerToken: reader.token,
    outsiderToken: outsider.token,
    leaderId: leader.id,
    managerId: manager.id,
    managerToken: manager.token,
    plainMemberId: plainMember.id,
    plainMemberToken: plainMember.token,
    eventTypeId: eventType.id,
    eventSeriesId: eventSeries.id,
    otherEventSeriesId: otherEventSeries.id,
    workRoleId: workRole.id,
    workRole2Id: workRole2.id,
    otherWorkRoleId: otherWorkRole.id,
  };
}

function auth(token: string): { 'x-token': string } {
  return { 'x-token': token };
}

async function createTeamDirect(organizationId: string, name: string): Promise<string> {
  const team = await db
    .insertInto('teams')
    .values({ name, organization_id: organizationId })
    .returning('id')
    .executeTakeFirstOrThrow();
  return team.id;
}

async function addMemberDirect(teamId: string, userId: string, isManager: boolean): Promise<void> {
  await db
    .insertInto('team_members')
    .values({ team_id: teamId, user_id: userId, is_manager: isManager })
    .execute();
}

/** Creates a team with the manager user as manager member and the plain user as plain member. */
async function seedManagedTeam(seedData: Seed): Promise<string> {
  const teamId = await createTeamDirect(seedData.organizationId, 'Managed Team');
  await addMemberDirect(teamId, seedData.managerId, true);
  await addMemberDirect(teamId, seedData.plainMemberId, false);
  return teamId;
}

describe('Teams API', () => {
  let app: FastifyInstance;
  let seedData: Seed;

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

  describe('GET /api/v1/organizations/:organizationId/teams', () => {
    it('lists teams with their leader, work roles and event series', async () => {
      await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.adminToken),
        payload: {
          name: 'Setup Crew',
          organizationId: seedData.organizationId,
          teamLeaderId: seedData.leaderId,
          workRoleIds: [seedData.workRoleId, seedData.workRole2Id],
          eventSeriesIds: [seedData.eventSeriesId],
        },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/teams?page=0&limit=50`,
        headers: auth(seedData.readerToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total).toBe(1);
      const team = body.items[0];
      expect(team.teamLeaderId).toBe(seedData.leaderId);
      expect(team.teamLeaderName).toBe('Team Leader');
      expect(team.workRoles).toEqual([
        { id: seedData.workRole2Id, name: 'Cleanup' },
        { id: seedData.workRoleId, name: 'Setup' },
      ]);
      expect(team.eventSeries).toEqual([{ id: seedData.eventSeriesId, title: 'Weekly Meeting' }]);
    });

    it('denies listing without team-management:read', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.outsiderToken),
      });

      expect(response.statusCode).toBe(403);
    });

    it('lists only the managed teams for a team manager without read permission', async () => {
      const managedTeamId = await seedManagedTeam(seedData);
      await createTeamDirect(seedData.organizationId, 'Other Team');

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/teams?page=0&limit=50`,
        headers: auth(seedData.managerToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.total).toBe(1);
      expect(body.items[0].id).toBe(managedTeamId);
    });

    it('denies listing for a member who manages no teams', async () => {
      await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.plainMemberToken),
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/organizations/:organizationId/teams', () => {
    it('creates a plain team by default', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.writerToken),
        payload: { name: 'Plain Team', organizationId: seedData.organizationId },
      });

      expect(response.statusCode).toBe(200);
      const team = response.json();
      expect(team.teamLeaderId).toBeNull();
      expect(team.workRoles).toEqual([]);
      expect(team.eventSeries).toEqual([]);
    });

    it('creates a team with a leader, work roles and event series', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.writerToken),
        payload: {
          name: 'Events Team',
          organizationId: seedData.organizationId,
          teamLeaderId: seedData.leaderId,
          workRoleIds: [seedData.workRoleId, seedData.workRole2Id],
          eventSeriesIds: [seedData.eventSeriesId],
        },
      });

      expect(response.statusCode).toBe(200);
      const team = response.json();
      expect(team.teamLeaderId).toBe(seedData.leaderId);
      expect(team.teamLeaderName).toBe('Team Leader');
      expect(team.workRoles).toEqual([
        { id: seedData.workRole2Id, name: 'Cleanup' },
        { id: seedData.workRoleId, name: 'Setup' },
      ]);
      expect(team.eventSeries).toEqual([{ id: seedData.eventSeriesId, title: 'Weekly Meeting' }]);
    });

    it('rejects an event series from another organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.writerToken),
        payload: {
          name: 'Cross Org Team',
          organizationId: seedData.organizationId,
          eventSeriesIds: [seedData.otherEventSeriesId],
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects a work role from another organization', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.writerToken),
        payload: {
          name: 'Cross Org Team',
          organizationId: seedData.organizationId,
          workRoleIds: [seedData.otherWorkRoleId],
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects a team leader who is not an organization member', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.writerToken),
        payload: {
          name: 'Outsider Led Team',
          organizationId: seedData.organizationId,
          teamLeaderId: randomUUID(),
        },
      });

      expect(response.statusCode).toBe(404);
    });

    it('denies creating without team-management:write', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.readerToken),
        payload: { name: 'Forbidden Team', organizationId: seedData.organizationId },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/organizations/:organizationId/teams/:teamId', () => {
    async function createTeamViaApi(payload: Record<string, unknown>): Promise<string> {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.adminToken),
        payload: { name: 'Team To Update', organizationId: seedData.organizationId, ...payload },
      });
      expect(response.statusCode).toBe(200);
      return response.json().id;
    }

    it('assigns work roles and event series to a team', async () => {
      const teamId = await createTeamViaApi({});

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.adminToken),
        payload: {
          workRoleIds: [seedData.workRoleId, seedData.workRole2Id],
          eventSeriesIds: [seedData.eventSeriesId],
          teamLeaderId: seedData.leaderId,
        },
      });

      expect(response.statusCode).toBe(200);
      const team = response.json();
      expect(team.workRoles).toEqual([
        { id: seedData.workRole2Id, name: 'Cleanup' },
        { id: seedData.workRoleId, name: 'Setup' },
      ]);
      expect(team.eventSeries).toEqual([{ id: seedData.eventSeriesId, title: 'Weekly Meeting' }]);
      expect(team.teamLeaderId).toBe(seedData.leaderId);
    });

    it('replaces the assigned work roles on update', async () => {
      const teamId = await createTeamViaApi({
        workRoleIds: [seedData.workRoleId],
        eventSeriesIds: [seedData.eventSeriesId],
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.adminToken),
        payload: { workRoleIds: [seedData.workRole2Id], eventSeriesIds: [] },
      });

      expect(response.statusCode).toBe(200);
      const team = response.json();
      expect(team.workRoles).toEqual([{ id: seedData.workRole2Id, name: 'Cleanup' }]);
      expect(team.eventSeries).toEqual([]);
    });

    it('keeps the existing links when only the leader changes', async () => {
      const teamId = await createTeamViaApi({
        workRoleIds: [seedData.workRoleId],
        eventSeriesIds: [seedData.eventSeriesId],
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.adminToken),
        payload: { teamLeaderId: seedData.leaderId },
      });

      expect(response.statusCode).toBe(200);
      const team = response.json();
      expect(team.workRoles).toEqual([{ id: seedData.workRoleId, name: 'Setup' }]);
      expect(team.eventSeries).toEqual([{ id: seedData.eventSeriesId, title: 'Weekly Meeting' }]);
      expect(team.teamLeaderId).toBe(seedData.leaderId);
    });

    it('clears the team leader with null', async () => {
      const teamId = await createTeamViaApi({ teamLeaderId: seedData.leaderId });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.adminToken),
        payload: { teamLeaderId: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().teamLeaderId).toBeNull();
    });

    it('lets a team manager edit the team without org-level write permission', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.managerToken),
        payload: { name: 'Manager Renamed' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Manager Renamed');
    });

    it('denies editing the team for a plain member', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.plainMemberToken),
        payload: { name: 'Nope' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('denies deleting the team for a team manager (org-level only)', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}`,
        headers: auth(seedData.managerToken),
      });

      expect(response.statusCode).toBe(403);
    });

    it('denies creating a team for a team manager (org-level only)', async () => {
      await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams`,
        headers: auth(seedData.managerToken),
        payload: { name: 'Manager Created Team', organizationId: seedData.organizationId },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/organizations/:organizationId/teams/:teamId/members/:userId', () => {
    it('lets an org writer toggle the manager flag', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members/${seedData.plainMemberId}`,
        headers: auth(seedData.writerToken),
        payload: { isManager: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().isManager).toBe(true);
    });

    it('lets a team manager toggle another member', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members/${seedData.plainMemberId}`,
        headers: auth(seedData.managerToken),
        payload: { isManager: true },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().isManager).toBe(true);
    });

    it('denies toggling for a plain member', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members/${seedData.managerId}`,
        headers: auth(seedData.plainMemberToken),
        payload: { isManager: false },
      });

      expect(response.statusCode).toBe(403);
    });

    it('returns 404 when the user is not a member', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members/${seedData.leaderId}`,
        headers: auth(seedData.adminToken),
        payload: { isManager: true },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/organizations/:organizationId/teams/:teamId/members', () => {
    it('lets a team manager add a member with the manager toggle', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members`,
        headers: auth(seedData.managerToken),
        payload: { userId: seedData.leaderId, isManager: true },
      });

      expect(response.statusCode).toBe(200);
      const member = response.json();
      expect(member.userId).toBe(seedData.leaderId);
      expect(member.isManager).toBe(true);
    });

    it('denies adding members for a plain member', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members`,
        headers: auth(seedData.plainMemberToken),
        payload: { userId: seedData.leaderId },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/organizations/:organizationId/teams/:teamId/members', () => {
    it('includes the manager flag and lets a team manager list members', async () => {
      const teamId = await seedManagedTeam(seedData);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/teams/${teamId}/members`,
        headers: auth(seedData.managerToken),
      });

      expect(response.statusCode).toBe(200);
      const members = response.json();
      expect(members).toHaveLength(2);
      const manager = members.find((m: { userId: string }) => m.userId === seedData.managerId);
      const plain = members.find((m: { userId: string }) => m.userId === seedData.plainMemberId);
      expect(manager.isManager).toBe(true);
      expect(plain.isManager).toBe(false);
    });
  });
});

describe('Event Types API', () => {
  let app: FastifyInstance;
  let seedData: Seed;

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

  describe('GET /api/v1/organizations/:organizationId/event-types', () => {
    it('lists only the event types of the organization', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/event-types`,
        headers: auth(seedData.readerToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(seedData.eventTypeId);
      expect(body[0].name).toBe('Weekly Meeting');
    });

    it('denies access without events:read', async () => {
      const nobody = await createUser('Nobody');
      await addUserToOrganization(nobody.id, seedData.organizationId);
      const nobodyRoleId = await createRole(seedData.organizationId, 'NoPerms', []);
      await assignRole(nobody.id, nobodyRoleId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/event-types`,
        headers: auth(nobody.token),
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
