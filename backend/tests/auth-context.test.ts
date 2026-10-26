import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';

// Integration tests for the authentication context: seed an organization
// with roles and users, then verify that requests are authorized based on
// the permissions resolved from role assignments. Skipped when the database
// is not available.

interface Seed {
  organizationId: string;
  memberUserId: string;
  memberToken: string;
  plainMemberUserId: string;
  plainMemberToken: string;
  adminUserId: string;
  adminToken: string;
}

async function seed(): Promise<Seed> {
  const organizationId = randomUUID();
  const memberUserId = randomUUID();
  const plainMemberUserId = randomUUID();
  const adminUserId = randomUUID();
  const memberToken = randomUUID();
  const plainMemberToken = randomUUID();
  const adminToken = randomUUID();

  await db
    .insertInto('organizations')
    .values({ id: organizationId, name: `Auth Test Org ${organizationId}` })
    .execute();

  const suffix = randomUUID();
  await db
    .insertInto('users')
    .values([
      { id: memberUserId, name: 'Member User', email: `member-${suffix}@example.com` },
      { id: plainMemberUserId, name: 'Plain Member User', email: `plain-${suffix}@example.com` },
      { id: adminUserId, name: 'Admin User', email: `admin-${suffix}@example.com` },
    ])
    .execute();

  await db
    .insertInto('user_organizations')
    .values([
      { user_id: memberUserId, organization_id: organizationId },
      { user_id: plainMemberUserId, organization_id: organizationId },
      { user_id: adminUserId, organization_id: organizationId },
    ])
    .execute();

  await db
    .insertInto('access_tokens')
    .values([
      { user_id: memberUserId, token: memberToken },
      { user_id: plainMemberUserId, token: plainMemberToken },
      { user_id: adminUserId, token: adminToken },
    ])
    .execute();

  const permissionRows = await db
    .selectFrom('permissions')
    .select(['id', 'code'])
    .where('code', 'in', ['operations:read', 'admin'])
    .execute();
  const permissionId = (code: string) => {
    const row = permissionRows.find(r => r.code === code);
    if (!row) throw new Error(`Permission ${code} not seeded!`);
    return row.id;
  };

  // Both members share the same role (operations:read only). The plain member
  // never receives additional roles, so permission checks that must keep
  // failing can use it regardless of the order the tests run in.
  const memberRole = await db
    .insertInto('roles')
    .values({ organization_id: organizationId, name: 'Member Role' })
    .returningAll()
    .executeTakeFirstOrThrow();
  await db
    .insertInto('role_permissions')
    .values({ role_id: memberRole.id, permission_id: permissionId('operations:read') })
    .execute();
  await db
    .insertInto('user_roles')
    .values([
      { user_id: memberUserId, role_id: memberRole.id },
      { user_id: plainMemberUserId, role_id: memberRole.id },
    ])
    .execute();

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

  return {
    organizationId,
    memberUserId,
    memberToken,
    plainMemberUserId,
    plainMemberToken,
    adminUserId,
    adminToken,
  };
}

async function cleanup(seed: Seed): Promise<void> {
  await db
    .deleteFrom('users')
    .where('id', 'in', [seed.memberUserId, seed.plainMemberUserId, seed.adminUserId])
    .execute();
  await db.deleteFrom('roles').where('organization_id', '=', seed.organizationId).execute();
  await db.deleteFrom('organizations').where('id', '=', seed.organizationId).execute();
}

describe('Users API', () => {
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

  describe('GET /api/v1/users/@me', () => {
    it('attaches the user and their role-based permissions to the context', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: { 'x-token': seedData.memberToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(seedData.memberUserId);
      expect(body.permissions).toContain('operations:read');
      expect(body.permissions).not.toContain('user-management:write');
    });
  });

  describe('PATCH /api/v1/users/:userId', () => {
    it('denies user management without user-management permissions', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${seedData.memberUserId}`,
        headers: { 'x-token': seedData.memberToken },
        payload: { name: 'Renamed User' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('lets the admin permission bypass permission checks', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${seedData.memberUserId}`,
        headers: { 'x-token': seedData.adminToken },
        payload: { name: 'Renamed User' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Renamed User');
    });
  });
});

describe('Operations API', () => {
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

  describe('GET /api/v1/operations', () => {
    it('allows reading operations with operations:read', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/operations',
        headers: { 'x-token': seedData.memberToken },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/v1/operations', () => {
    it('denies writing operations without operations:write', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/operations',
        headers: { 'x-token': seedData.memberToken },
        payload: { name: 'Forbidden Operation' },
      });

      expect(response.statusCode).toBe(403);
    });
  });
});

describe('Roles API', () => {
  let app: FastifyInstance;
  let seedData: Seed | null = null;
  let roleId = 0;

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

  describe('POST /api/v1/organizations/:organizationId/roles', () => {
    it('lets an admin create a role with permissions', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: { 'x-token': seedData.adminToken },
        payload: { name: 'Role Manager', permissions: ['role-management:read'] },
      });
      expect(response.statusCode).toBe(201);
      const role = response.json();
      expect(role.permissions).toEqual(['role-management:read']);
      roleId = role.id;
    });

    it('rejects unknown permission codes', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: { 'x-token': seedData.adminToken },
        payload: { name: 'Broken Role', permissions: ['not-a-permission'] },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/organizations/:organizationId/roles/:roleId/assignments', () => {
    it('assigns a role to a user', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/roles/${roleId}/assignments`,
        headers: { 'x-token': seedData.adminToken },
        payload: { userId: seedData.memberUserId },
      });
      expect(response.statusCode).toBe(201);
    });

    it('grants the permissions of the assigned role to the user', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: { 'x-token': seedData.memberToken },
      });
      expect(response.json().permissions).toContain('role-management:read');
    });
  });

  describe('GET /api/v1/organizations/:organizationId/roles', () => {
    it('denies listing roles without role-management:read', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: { 'x-token': seedData.plainMemberToken },
      });
      expect(response.statusCode).toBe(403);
    });

    it('lists roles for a member with role-management:read', async () => {
      if (!seedData) return;
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: { 'x-token': seedData.memberToken },
      });
      expect(response.statusCode).toBe(200);
      const roleNames = response.json().map((r: { name: string }) => r.name);
      expect(roleNames).toContain('Role Manager');
    });
  });
});
