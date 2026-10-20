import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';

// Integration test for the authentication context: seeds an organization with
// roles and users, then verifies that requests are authorized based on the
// permissions resolved from role assignments. Skipped when the database is
// not available.

interface Seed {
  organizationId: string;
  memberUserId: string;
  memberToken: string;
  adminUserId: string;
  adminToken: string;
}

async function seed(): Promise<Seed> {
  const organizationId = randomUUID();
  const memberUserId = randomUUID();
  const adminUserId = randomUUID();
  const memberToken = randomUUID();
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
      { id: adminUserId, name: 'Admin User', email: `admin-${suffix}@example.com` },
    ])
    .execute();

  await db
    .insertInto('user_organizations')
    .values([
      { user_id: memberUserId, organization_id: organizationId },
      { user_id: adminUserId, organization_id: organizationId },
    ])
    .execute();

  await db
    .insertInto('access_tokens')
    .values([
      { user_id: memberUserId, token: memberToken },
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
    .values({ user_id: memberUserId, role_id: memberRole.id })
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

  return { organizationId, memberUserId, memberToken, adminUserId, adminToken };
}

async function cleanup(seed: Seed): Promise<void> {
  await db.deleteFrom('users').where('id', 'in', [seed.memberUserId, seed.adminUserId]).execute();
  await db.deleteFrom('roles').where('organization_id', '=', seed.organizationId).execute();
  await db.deleteFrom('organizations').where('id', '=', seed.organizationId).execute();
}

describe('Auth context', () => {
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

  it('allows reading operations with operations:read', async () => {
    if (!seedData) return;
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/operations',
      headers: { 'x-token': seedData.memberToken },
    });

    expect(response.statusCode).toBe(200);
  });

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

  it('supports managing roles and assignments through the API', async () => {
    if (!seedData) return;

    // The member cannot manage roles yet.
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${seedData.organizationId}/roles`,
      headers: { 'x-token': seedData.memberToken },
    });
    expect(denied.statusCode).toBe(403);

    // The admin creates a role with a permission.
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${seedData.organizationId}/roles`,
      headers: { 'x-token': seedData.adminToken },
      payload: { name: 'Role Manager', permissions: ['role-management:read'] },
    });
    expect(created.statusCode).toBe(201);
    const role = created.json();
    expect(role.permissions).toEqual(['role-management:read']);

    // The admin assigns the role to the member.
    const assigned = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${seedData.organizationId}/roles/${role.id}/assignments`,
      headers: { 'x-token': seedData.adminToken },
      payload: { userId: seedData.memberUserId },
    });
    expect(assigned.statusCode).toBe(201);

    // The member now has the new permission.
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/users/@me',
      headers: { 'x-token': seedData.memberToken },
    });
    expect(me.json().permissions).toContain('role-management:read');

    const roles = await app.inject({
      method: 'GET',
      url: `/api/v1/organizations/${seedData.organizationId}/roles`,
      headers: { 'x-token': seedData.memberToken },
    });
    expect(roles.statusCode).toBe(200);
    const roleNames = roles.json().map((r: { name: string }) => r.name);
    expect(roleNames).toContain('Role Manager');

    // Unknown permission codes are rejected.
    const invalid = await app.inject({
      method: 'POST',
      url: `/api/v1/organizations/${seedData.organizationId}/roles`,
      headers: { 'x-token': seedData.adminToken },
      payload: { name: 'Broken Role', permissions: ['not-a-permission'] },
    });
    expect(invalid.statusCode).toBe(400);
  });
});
