import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import {
  addUserToOrganization,
  assignRole,
  createOrganization,
  createRole,
  createUser,
  resetDatabase,
} from './helpers/fixtures.js';

// Integration tests for the authentication context: an organization with
// roles and users, verifying that requests are authorized based on the
// permissions resolved from role assignments. Every test resets the database
// (beforeEach) and rebuilds the fixture, so tests are independent and a
// broken seed fails the test instead of being masked.

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
  const organizationId = await createOrganization(`Auth Test Org ${randomUUID()}`);

  const member = await createUser('Member User');
  const plainMember = await createUser('Plain Member User');
  const admin = await createUser('Admin User');
  for (const user of [member, plainMember, admin]) {
    await addUserToOrganization(user.id, organizationId);
  }

  // Both members share the same role (events:read only). The plain member
  // never receives additional roles, so permission checks that must keep
  // failing can use it regardless of the order the tests run in.
  const memberRole = await createRole(organizationId, 'Member Role', ['events:read']);
  await assignRole(member.id, memberRole);
  await assignRole(plainMember.id, memberRole);

  const adminRole = await createRole(organizationId, 'Admin Role', ['admin']);
  await assignRole(admin.id, adminRole);

  return {
    organizationId,
    memberUserId: member.id,
    memberToken: member.token,
    plainMemberUserId: plainMember.id,
    plainMemberToken: plainMember.token,
    adminUserId: admin.id,
    adminToken: admin.token,
  };
}

let app: FastifyInstance;
let seedData: Seed;

const auth = (token: string) => ({ 'x-token': token });

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

const createRoleViaApi = async (
  seed: Seed,
  name: string,
  permissions: string[],
): Promise<{ id: number; permissions: string[] }> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/organizations/${seed.organizationId}/roles`,
    headers: auth(seed.adminToken),
    payload: { name, permissions },
  });
  expect(response.statusCode).toBe(201);
  return response.json() as { id: number; permissions: string[] };
};

const assignRoleViaApi = async (seed: Seed, roleId: number, userId: string): Promise<void> => {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/organizations/${seed.organizationId}/roles/${roleId}/assignments`,
    headers: auth(seed.adminToken),
    payload: { userId },
  });
  expect(response.statusCode).toBe(201);
};

describe('Users API', () => {
  describe('GET /api/v1/users/@me', () => {
    it('attaches the user and their role-based permissions to the context', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: auth(seedData.memberToken),
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(seedData.memberUserId);
      expect(body.permissions).toContain('events:read');
      expect(body.permissions).not.toContain('user-management:write');
    });
  });

  describe('PATCH /api/v1/users/:userId', () => {
    it('denies user management without user-management permissions', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${seedData.memberUserId}`,
        headers: auth(seedData.memberToken),
        payload: { name: 'Renamed User' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('lets the admin permission bypass permission checks', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/v1/users/${seedData.memberUserId}`,
        headers: auth(seedData.adminToken),
        payload: { name: 'Renamed User' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Renamed User');
    });
  });
});

describe('Roles API', () => {
  describe('POST /api/v1/organizations/:organizationId/roles', () => {
    it('lets an admin create a role with permissions', async () => {
      const role = await createRoleViaApi(seedData, 'Role Manager', ['role-management:read']);
      expect(role.permissions).toEqual(['role-management:read']);
    });

    it('rejects unknown permission codes', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: auth(seedData.adminToken),
        payload: { name: 'Broken Role', permissions: ['not-a-permission'] },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/organizations/:organizationId/roles/:roleId/assignments', () => {
    it('assigns a role to a user', async () => {
      const role = await createRoleViaApi(seedData, 'Role Manager', ['role-management:read']);
      await assignRoleViaApi(seedData, role.id, seedData.memberUserId);
    });

    it('grants the permissions of the assigned role to the user', async () => {
      const role = await createRoleViaApi(seedData, 'Role Manager', ['role-management:read']);
      await assignRoleViaApi(seedData, role.id, seedData.memberUserId);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: auth(seedData.memberToken),
      });
      expect(response.json().permissions).toContain('role-management:read');
    });
  });

  describe('GET /api/v1/organizations/:organizationId/roles', () => {
    it('denies listing roles without role-management:read', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: auth(seedData.plainMemberToken),
      });
      expect(response.statusCode).toBe(403);
    });

    it('lists roles for a member with role-management:read', async () => {
      const role = await createRoleViaApi(seedData, 'Role Manager', ['role-management:read']);
      await assignRoleViaApi(seedData, role.id, seedData.memberUserId);

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${seedData.organizationId}/roles`,
        headers: auth(seedData.memberToken),
      });
      expect(response.statusCode).toBe(200);
      const roleNames = response.json().map((r: { name: string }) => r.name);
      expect(roleNames).toContain('Role Manager');
    });
  });
});
