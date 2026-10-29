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

// Integration tests for event role requirements and critical/non-critical
// roles (items 3 and 4 of the church organization evaluation). Tests cover
// the role requirements CRUD API, is_critical on job slots, the readiness
// computation in the occurrence detail, and permission enforcement.

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

  // Create an event series.
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

describe('Event Role Requirements API', () => {
  describe('POST /api/v1/event-series/:seriesId/role-requirements', () => {
    it('creates a role requirement', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRoleId, quantity: 1, isCritical: true },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.workRoleId).toBe(seed.workRoleId);
      expect(body.workRoleName).toBe('Worship Leader');
      expect(body.quantity).toBe(1);
      expect(body.isCritical).toBe(true);
    });

    it('rejects duplicate work role for the same series', async () => {
      const seed = await createFixture();
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRoleId },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRoleId },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects unauthenticated requests', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        payload: { workRoleId: seed.workRoleId },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects users without events:write', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.memberToken),
        payload: { workRoleId: seed.workRoleId },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/event-series/:seriesId/role-requirements', () => {
    it('lists role requirements', async () => {
      const seed = await createFixture();
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRoleId, quantity: 1, isCritical: true },
      });
      await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRole2Id, quantity: 2, isCritical: false },
      });
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.readerToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(2);
      expect(body[0].workRoleName).toBe('Worship Leader');
      expect(body[0].isCritical).toBe(true);
      expect(body[1].workRoleName).toBe('Greeter');
      expect(body[1].quantity).toBe(2);
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/role-requirements/:requirementId', () => {
    it('updates quantity and isCritical', async () => {
      const seed = await createFixture();
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRoleId, quantity: 1, isCritical: false },
      });
      const reqId = created.json().id;
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements/${reqId}`,
        ...auth(seed.adminToken),
        payload: { quantity: 3, isCritical: true },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.quantity).toBe(3);
      expect(body.isCritical).toBe(true);
    });
  });

  describe('DELETE /api/v1/event-series/:seriesId/role-requirements/:requirementId', () => {
    it('deletes a role requirement', async () => {
      const seed = await createFixture();
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.adminToken),
        payload: { workRoleId: seed.workRoleId },
      });
      const reqId = created.json().id;
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements/${reqId}`,
        ...auth(seed.adminToken),
      });
      expect(res.statusCode).toBe(200);
      const list = await app.inject({
        method: 'GET',
        url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
        ...auth(seed.readerToken),
      });
      expect(list.json()).toHaveLength(0);
    });
  });
});

describe('Critical vs Non-Critical Job Slots', () => {
  describe('POST /api/v1/event-series/:seriesId/jobs', () => {
    it('creates a job slot with isCritical and workRoleId', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/jobs`,
        ...auth(seed.adminToken),
        payload: {
          title: 'Worship Leader',
          isCritical: true,
          workRoleId: seed.workRoleId,
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.isCritical).toBe(true);
      expect(body.workRoleId).toBe(seed.workRoleId);
    });

    it('defaults isCritical to false', async () => {
      const seed = await createFixture();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/jobs`,
        ...auth(seed.adminToken),
        payload: { title: 'Greeter' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isCritical).toBe(false);
    });
  });

  describe('PATCH /api/v1/event-series/:seriesId/jobs/:jobId', () => {
    it('updates isCritical', async () => {
      const seed = await createFixture();
      const created = await app.inject({
        method: 'POST',
        url: `/api/v1/event-series/${seed.seriesId}/jobs`,
        ...auth(seed.adminToken),
        payload: { title: 'Greeter', isCritical: false },
      });
      const jobId = created.json().id;
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/event-series/${seed.seriesId}/jobs/${jobId}`,
        ...auth(seed.adminToken),
        payload: { isCritical: true },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().isCritical).toBe(true);
    });
  });
});

describe('Event Readiness (occurrence detail)', () => {
  const occurrenceStart = '2025-01-05T10:00:00.000Z';

  async function setupReadinessFixture(): Promise<Seed> {
    const seed = await createFixture();
    // Add role requirements: 1 Worship Leader (critical), 2 Greeters (optional).
    await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
      ...auth(seed.adminToken),
      payload: { workRoleId: seed.workRoleId, quantity: 1, isCritical: true },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/role-requirements`,
      ...auth(seed.adminToken),
      payload: { workRoleId: seed.workRole2Id, quantity: 2, isCritical: false },
    });
    return seed;
  }

  it('reports not ready when critical role is unfilled', async () => {
    const seed = await setupReadinessFixture();
    // Create a critical job slot linked to Worship Leader, but no assignments.
    await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/jobs`,
      ...auth(seed.adminToken),
      payload: {
        title: 'Worship Leader',
        isCritical: true,
        workRoleId: seed.workRoleId,
        occurrenceStart,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seed.seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`,
      ...auth(seed.readerToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.readiness.isReady).toBe(false);
    expect(body.readiness.unfilledCriticalCount).toBe(1);
    const criticalRole = body.readiness.roles.find(
      (r: { workRoleId: number }) => r.workRoleId === seed.workRoleId,
    );
    expect(criticalRole.isUnfilled).toBe(true);
    expect(criticalRole.filled).toBe(0);
    expect(criticalRole.required).toBe(1);
  });

  it('reports ready when critical role is filled', async () => {
    const seed = await setupReadinessFixture();
    const jobRes = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/jobs`,
      ...auth(seed.adminToken),
      payload: {
        title: 'Worship Leader',
        isCritical: true,
        workRoleId: seed.workRoleId,
        occurrenceStart,
      },
    });
    const jobId = jobRes.json().id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/jobs/${jobId}/assignments`,
      ...auth(seed.adminToken),
      payload: { userId: seed.memberId },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seed.seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`,
      ...auth(seed.readerToken),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.readiness.isReady).toBe(true);
    expect(body.readiness.unfilledCriticalCount).toBe(0);
    const criticalRole = body.readiness.roles.find(
      (r: { workRoleId: number }) => r.workRoleId === seed.workRoleId,
    );
    expect(criticalRole.filled).toBe(1);
    expect(criticalRole.isUnfilled).toBe(false);
  });

  it('optional unfilled roles do not affect readiness', async () => {
    const seed = await setupReadinessFixture();
    // Fill the critical role but leave greeters unfilled.
    const jobRes = await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/jobs`,
      ...auth(seed.adminToken),
      payload: {
        title: 'Worship Leader',
        isCritical: true,
        workRoleId: seed.workRoleId,
        occurrenceStart,
      },
    });
    const jobId = jobRes.json().id;
    await app.inject({
      method: 'POST',
      url: `/api/v1/event-series/${seed.seriesId}/jobs/${jobId}/assignments`,
      ...auth(seed.adminToken),
      payload: { userId: seed.memberId },
    });
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seed.seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`,
      ...auth(seed.readerToken),
    });
    const body = res.json();
    expect(body.readiness.isReady).toBe(true);
    const greeterRole = body.readiness.roles.find(
      (r: { workRoleId: number }) => r.workRoleId === seed.workRole2Id,
    );
    expect(greeterRole.isCritical).toBe(false);
    expect(greeterRole.filled).toBe(0);
    expect(greeterRole.isUnfilled).toBe(false);
  });

  it('includes roleRequirements in the detail response', async () => {
    const seed = await setupReadinessFixture();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seed.seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`,
      ...auth(seed.readerToken),
    });
    const body = res.json();
    expect(body.roleRequirements).toHaveLength(2);
    expect(body.roleRequirements[0].workRoleName).toBe('Worship Leader');
  });

  it('returns ready with no requirements when none are defined', async () => {
    const seed = await createFixture();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/event-series/${seed.seriesId}/occurrences/${encodeURIComponent(occurrenceStart)}`,
      ...auth(seed.readerToken),
    });
    const body = res.json();
    expect(body.readiness.isReady).toBe(true);
    expect(body.readiness.roles).toHaveLength(0);
  });
});
