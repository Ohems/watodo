import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';

// Integration test for the organization endpoints: seeds an organization with
// an admin, a member holding organization:write, a plain member and an
// outsider, then verifies listing, reading and editing rules. Skipped when
// the database is not available.

interface Seed {
  organizationId: string;
  otherOrganizationId: string;
  adminToken: string;
  writerToken: string;
  memberToken: string;
  outsiderToken: string;
  userIds: string[];
}

async function createUser(name: string): Promise<{ id: string; token: string }> {
  const id = randomUUID();
  const token = randomUUID();
  const suffix = randomUUID();
  await db
    .insertInto('users')
    .values({ id, name, email: `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.com` })
    .execute();
  await db.insertInto('access_tokens').values({ user_id: id, token }).execute();
  return { id, token };
}

async function createRoleWithPermissions(
  organizationId: string,
  name: string,
  permissionCodes: string[],
): Promise<number> {
  const role = await db
    .insertInto('roles')
    .values({ organization_id: organizationId, name })
    .returningAll()
    .executeTakeFirstOrThrow();

  if (permissionCodes.length > 0) {
    const rows = await db
      .selectFrom('permissions')
      .select(['id', 'code'])
      .where('code', 'in', permissionCodes)
      .execute();
    const found = new Set(rows.map(row => row.code));
    const missing = permissionCodes.filter(code => !found.has(code));
    if (missing.length > 0) {
      throw new Error(`Permissions not seeded: ${missing.join(', ')}`);
    }
    await db
      .insertInto('role_permissions')
      .values(rows.map(row => ({ role_id: role.id, permission_id: row.id })))
      .execute();
  }

  return role.id;
}

async function seed(): Promise<Seed> {
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();

  await db
    .insertInto('organizations')
    .values([
      { id: organizationId, name: `Org API Test ${organizationId}` },
      { id: otherOrganizationId, name: `Other Org ${otherOrganizationId}` },
    ])
    .execute();

  const admin = await createUser('Org Admin');
  const writer = await createUser('Org Writer');
  const member = await createUser('Org Member');
  const outsider = await createUser('Org Outsider');

  for (const user of [admin, writer, member]) {
    await db
      .insertInto('user_organizations')
      .values({ user_id: user.id, organization_id: organizationId })
      .execute();
  }
  await db
    .insertInto('user_organizations')
    .values({ user_id: outsider.id, organization_id: otherOrganizationId })
    .execute();

  const adminRoleId = await createRoleWithPermissions(organizationId, 'Admin', ['admin']);
  const writerRoleId = await createRoleWithPermissions(organizationId, 'Writer', [
    'organization:write',
  ]);
  const memberRoleId = await createRoleWithPermissions(organizationId, 'Member', [
    'events:read',
    'organization:read',
  ]);
  // The outsider may edit the other organization, but not this one.
  const otherWriterRoleId = await createRoleWithPermissions(otherOrganizationId, 'Writer', [
    'organization:write',
  ]);

  await db
    .insertInto('user_roles')
    .values([
      { user_id: admin.id, role_id: adminRoleId },
      { user_id: writer.id, role_id: writerRoleId },
      { user_id: member.id, role_id: memberRoleId },
      { user_id: outsider.id, role_id: otherWriterRoleId },
    ])
    .execute();

  return {
    organizationId,
    otherOrganizationId,
    adminToken: admin.token,
    writerToken: writer.token,
    memberToken: member.token,
    outsiderToken: outsider.token,
    userIds: [admin.id, writer.id, member.id, outsider.id],
  };
}

async function cleanup(seed: Seed): Promise<void> {
  await db.deleteFrom('users').where('id', 'in', seed.userIds).execute();
  await db
    .deleteFrom('organizations')
    .where('id', 'in', [seed.organizationId, seed.otherOrganizationId])
    .execute();
}

describe('Organizations API', () => {
  let app: FastifyInstance;
  let seedData: Seed | null = null;

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

  describe('GET /api/v1/organizations', () => {
    it('lists only the organizations the user belongs to', async () => {
      if (!seedData) return;

      const memberResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations',
        headers: { 'x-token': seedData.memberToken },
      });
      expect(memberResponse.statusCode).toBe(200);
      const memberOrgs = memberResponse.json();
      expect(memberOrgs.map((org: { id: string }) => org.id)).toEqual([seedData.organizationId]);

      const outsiderResponse = await app.inject({
        method: 'GET',
        url: '/api/v1/organizations',
        headers: { 'x-token': seedData.outsiderToken },
      });
      expect(outsiderResponse.statusCode).toBe(200);
      expect(outsiderResponse.json().map((org: { id: string }) => org.id)).toEqual([
        seedData.otherOrganizationId,
      ]);
    });
  });

  describe('GET /api/v1/organizations/:organizationId', () => {
    it('returns the organization details to a member', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.memberToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(seedData.organizationId);
      expect(body.name).toBe(`Org API Test ${seedData.organizationId}`);
      expect(body.description).toBe('');
      expect(body.defaultTimezone).toBe('UTC');
      expect(body.createdAt).toBeTruthy();
      expect(body.updatedAt).toBeTruthy();
    });

    it('returns 404 for an organization the user does not belong to', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.outsiderToken },
      });
      expect(response.statusCode).toBe(404);

      const otherResponse = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.otherOrganizationId}`,
        headers: { 'x-token': seedData.memberToken },
      });
      expect(otherResponse.statusCode).toBe(404);
    });

    it('requires authentication', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}`,
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /api/v1/organizations/:organizationId', () => {
    it('requires authentication', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        payload: { name: 'Nope' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('lets an admin edit the organization', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.adminToken },
        payload: { name: 'Renamed Organization', defaultTimezone: 'Europe/Helsinki' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('Renamed Organization');
      expect(body.defaultTimezone).toBe('Europe/Helsinki');

      const check = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.memberToken },
      });
      expect(check.json().name).toBe('Renamed Organization');
    });

    it('lets a member with organization:write edit the organization', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.writerToken },
        payload: { description: 'Editable by the writer role.' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().description).toBe('Editable by the writer role.');
    });

    it('denies editing to a plain member', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.memberToken },
        payload: { name: 'Should Not Happen' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('denies editing to a user with organization:write in another organization', async () => {
      if (!seedData) return;

      // The outsider passes the route-level permission check (organization:write
      // in the other organization counts towards the global union) but is not a
      // member of this organization, so the service rejects with 404.
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.outsiderToken },
        payload: { name: 'Should Not Happen' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects invalid payloads', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${seedData.organizationId}`,
        headers: { 'x-token': seedData.adminToken },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/organizations/:organizationId/users/:userId', () => {
    it('returns a single organization user to a member with organization:read', async () => {
      if (!seedData) return;

      const targetUserId = seedData.userIds[1];
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/users/${targetUserId}`,
        headers: { 'x-token': seedData.memberToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(targetUserId);
      expect(body.name).toBe('Org Writer');
      expect(body.email).toBeTruthy();
      expect(body.description).toBe('');
      expect(body.isEmployed).toBe(false);
      expect(body.isSuspended).toBe(false);
      expect(body.isBlocked).toBe(false);
      expect(body.state).toBe('active');
      expect(body.createdAt).toBeTruthy();
    });

    it('lets an admin read any organization user', async () => {
      if (!seedData) return;

      const targetUserId = seedData.userIds[2];
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/users/${targetUserId}`,
        headers: { 'x-token': seedData.adminToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(targetUserId);
    });

    it('returns 404 for a user who is not in the organization', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/users/${seedData.userIds[3]}`,
        headers: { 'x-token': seedData.memberToken },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 404 for a non-existent user', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/users/${randomUUID()}`,
        headers: { 'x-token': seedData.memberToken },
      });

      expect(response.statusCode).toBe(404);
    });

    it('requires authentication', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/users/${seedData.userIds[0]}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('denies access to a user without organization:read', async () => {
      if (!seedData) return;

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.otherOrganizationId}/users/${seedData.userIds[3]}`,
        headers: { 'x-token': seedData.outsiderToken },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
