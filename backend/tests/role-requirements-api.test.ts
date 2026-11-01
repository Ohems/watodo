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

// Integration tests for critical/non-critical work role slots on an event
// series and the readiness computation in the occurrence detail: creating
// slots with isCritical/workRoleId, updating them, permission enforcement,
// and how filled/unfilled critical slots drive readiness.

interface Seed {
  organizationId: string;
  calendarId: string;
  adminToken: string;
  readerToken: string;
  memberToken: string;
  memberId: string;
  workRoleId: number;
  workRole2Id: number;
  seriesId: number;
}

async function createFixture(): Promise<Seed> {
  const organizationId = await createOrganization(`Role Req Org ${randomUUID()}`);
  const calendarId = await createCalendar(organizationId, 'Calendar');

  const admin = await createUser('Admin');
  const reader = await createUser('Reader');
  const member = await createUser('Member');
  for (const user of [admin, reader, member]) {
    await addUserToOrganization(user.id, organizationId);
  }
  const adminRole = await createRole(organizationId, 'Admin', ['admin']);
  await assignRole(admin.id, adminRole);
  const readerRole = await createRole(organizationId, 'Reader', ['events:read', 'events:write']);
  await assignRole(reader.id, readerRole);

  // Create work roles.
  const wr1 = await db
    .insertInto('work_roles')
    .values({ name: 'Worship Leader', organization_id: organizationId })
    .returningAll()
    .executeTakeFirstOrThrow();
  const wr2 = await db
    .insertInto('work_roles')
    .values({ name: 'Greeter', organization_id: organizationId })
    .returningAll()
    .executeTakeFirstOrThrow();

  // Create an event series (single occurrence at its start).
  const series = await db
    .insertInto('event_series')
    .values({
      title: 'Sunday Service',
      calendar_id: calendarId,
      start: new Date('2025-01-05T10:00:00Z'),
      duration_minutes: 90,
      timezone: 'UTC',
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return {
    organizationId,
    calendarId,
    adminToken: admin.token,
    readerToken: reader.token,
    memberToken: member.token,
    memberId: member.id,
    workRoleId: wr1.id,
    workRole2Id: wr2.id,
    seriesId: series.id,
  };
}

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
});

function auth(token: string): { headers: Record<string, string> } {
  return { headers: { 'x-token': token } };
}

async function createSlot(
  seed: Seed,
  payload: Record<string, unknown>,
): Promise<{ id: number; isCritical: boolean; workRoleId: number | null }> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seed.seriesId}/work-roles`,
    ...auth(seed.adminToken),
    payload,
  });
  expect(res.statusCode).toBe(200);
  return res.json() as { id: number; isCritical: boolean; workRoleId: number | null };
}

async function assignToSlot(seed: Seed, slotId: number, userId: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/event-series/${seed.seriesId}/work-roles/${slotId}/assignments`,
    ...auth(seed.adminToken),
    payload: { userId },
  });
  expect(res.statusCode).toBe(200);
}

async function getReadiness(
  seed: Seed,
  occurrenceStart: string,
): Promise<{
  isReady: boolean;
  unfilledCriticalCount: number;
  roles: {
    workRoleId: number | null;
    workRoleName: string;
    required: number;
    filled: number;
    isCritical: boolean;
    isUnfilled: boolean;
  }[];
}> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/event-series/${seed.seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`,
    ...auth(seed.readerToken),
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { readiness: never }).readiness;
}

describe('Critical vs Non-Critical Work Role Slots', () => {
  describe('POST /api/v1/event-series/:seriesId/work-roles', () => {
    it('creates a slot with isCritical and workRoleId', async () => {
      const seed = await createFixture();
      const slot = await createSlot(seed, {
        title: 'Worship Leader',
        isCritical: true,
        workRoleId: seed.workRoleId,
      });
      expect(slot.isCritical).toBe(true);
      expect(slot.workRoleId).toBe(seed.workRoleId);
    });

    it('defaults isCritical to false', async () => {
      const seed = await createFixture();
      const slot = await createSlot(seed, { title: 'Greeter' });
      expect(slot.isCritical).toBe(false);
    });

    it('rejects unauthenticated requests', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/work-roles`,
        payload: { title: 'Greeter' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects users without events:write', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/work-roles`,
        ...auth(seed.memberToken),
        payload: { title: 'Greeter' },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/work-roles/:workRoleId', () => {
    it('updates isCritical', async () => {
      const seed = await createFixture();
      const slot = await createSlot(seed, { title: 'Greeter', isCritical: false });
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${seed.seriesId}/work-roles/${slot.id}`,
        ...auth(seed.adminToken),
        payload: { isCritical: true },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { isCritical: boolean }).isCritical).toBe(true);
    });
  });
});

describe('Event Readiness (occurrence detail)', () => {
  const occurrenceStart = '2025-01-05T10:00:00.000Z';

  it('reports not ready when a critical slot is unfilled', async () => {
    const seed = await createFixture();
    // Critical slot linked to Worship Leader, but no assignments.
    await createSlot(seed, {
      title: 'Worship Leader',
      isCritical: true,
      workRoleId: seed.workRoleId,
    });
    const readiness = await getReadiness(seed, occurrenceStart);
    expect(readiness.isReady).toBe(false);
    expect(readiness.unfilledCriticalCount).toBe(1);
    const criticalRole = readiness.roles.find(r => r.workRoleId === seed.workRoleId);
    expect(criticalRole).toMatchObject({
      workRoleName: 'Worship Leader',
      required: 1,
      filled: 0,
      isCritical: true,
      isUnfilled: true,
    });
  });

  it('reports ready when the critical slot is filled', async () => {
    const seed = await createFixture();
    const slot = await createSlot(seed, {
      title: 'Worship Leader',
      isCritical: true,
      workRoleId: seed.workRoleId,
    });
    await assignToSlot(seed, slot.id, seed.memberId);
    const readiness = await getReadiness(seed, occurrenceStart);
    expect(readiness.isReady).toBe(true);
    expect(readiness.unfilledCriticalCount).toBe(0);
    const criticalRole = readiness.roles.find(r => r.workRoleId === seed.workRoleId);
    expect(criticalRole).toMatchObject({ filled: 1, isUnfilled: false });
  });

  it('optional unfilled slots do not affect readiness', async () => {
    const seed = await createFixture();
    // Fill the critical slot but leave the optional greeter slot unfilled.
    const slot = await createSlot(seed, {
      title: 'Worship Leader',
      isCritical: true,
      workRoleId: seed.workRoleId,
    });
    await assignToSlot(seed, slot.id, seed.memberId);
    await createSlot(seed, {
      title: 'Greeter',
      isCritical: false,
      workRoleId: seed.workRole2Id,
    });
    const readiness = await getReadiness(seed, occurrenceStart);
    expect(readiness.isReady).toBe(true);
    expect(readiness.unfilledCriticalCount).toBe(0);
    const greeterRole = readiness.roles.find(r => r.workRoleId === seed.workRole2Id);
    expect(greeterRole).toMatchObject({
      workRoleName: 'Greeter',
      required: 1,
      filled: 0,
      isCritical: false,
      isUnfilled: false,
    });
  });

  it('groups the readiness roles by work role in the detail response', async () => {
    const seed = await createFixture();
    await createSlot(seed, {
      title: 'Worship Leader',
      isCritical: true,
      workRoleId: seed.workRoleId,
    });
    await createSlot(seed, { title: 'Greeter', workRoleId: seed.workRole2Id });
    const readiness = await getReadiness(seed, occurrenceStart);
    expect(readiness.roles).toHaveLength(2);
    expect(readiness.roles.find(r => r.workRoleId === seed.workRoleId)?.workRoleName).toBe(
      'Worship Leader',
    );
    expect(readiness.roles.find(r => r.workRoleId === seed.workRole2Id)?.workRoleName).toBe(
      'Greeter',
    );
  });

  it('reports ready with no roles when no slots are defined', async () => {
    const seed = await createFixture();
    const readiness = await getReadiness(seed, occurrenceStart);
    expect(readiness.isReady).toBe(true);
    expect(readiness.roles).toHaveLength(0);
  });
});
