import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database.js';
import { getAuthContext, handleNewLogin } from '../src/services/auth-service.js';
import { getEffectivePermissions } from '../src/services/permission-service.js';

// Integration test for the login flow: mocks the external services (Redis
// login-state storage and the OAuth provider), then verifies against a real
// database that the first user gets an organization and admin rights, and
// that later users do not. Skipped when the database is not available.

const fakes = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  const profile = {
    id: 'provider-account-1',
    email: 'first.user@example.com',
    name: 'First User',
  };
  return { redisStore, profile };
});

vi.mock('../src/redis.js', () => ({
  getRedisClient: () => ({
    set: async (key: string, value: string) => {
      fakes.redisStore.set(key, value);
    },
    get: async (key: string) => fakes.redisStore.get(key) ?? null,
    exists: async (key: string) => (fakes.redisStore.has(key) ? 1 : 0),
    del: async (key: string) => {
      fakes.redisStore.delete(key);
    },
  }),
  connectRedis: async () => {},
  disconnectRedis: async () => {},
}));

vi.mock('../src/services/auth-providers/index.js', () => ({
  SUPPORTED_PROVIDERS: ['discord', 'google', 'microsoft'],
  isSupportedProvider: (provider: string) => ['discord', 'google', 'microsoft'].includes(provider),
  getProvider: () => ({
    id: 'discord',
    isConfigured: true,
    getAuthorizationUrl: (state: string) => `https://provider.example/authorize?state=${state}`,
    exchangeCode: async () => ({
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
    getProfile: async () => fakes.profile,
    refreshAccessToken: async () => ({
      access_token: 'fake-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
    }),
  }),
}));

function stageLogin(stateId: string, returnUrl: string): void {
  fakes.redisStore.set(
    `login:state:${stateId}`,
    JSON.stringify({ returnUrl, userAgent: 'vitest' }),
  );
}

async function clearDatabase(): Promise<void> {
  await db.deleteFrom('users').execute();
  await db.deleteFrom('organizations').execute();
}

async function countRows(table: 'users' | 'organizations'): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

describe('First login flow', () => {
  let dbAvailable = false;
  let firstUserId = '';

  beforeAll(async () => {
    try {
      await db.selectFrom('users').select('id').limit(1).execute();
      dbAvailable = true;
      await clearDatabase();
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (dbAvailable) await clearDatabase().catch(() => {});
  });

  it('creates a user, an organization and admin rights for the first user', async () => {
    if (!dbAvailable) return;
    fakes.profile = {
      id: 'provider-account-1',
      email: 'first.user@example.com',
      name: 'First User',
    };
    stageLogin('state-1', '/');

    const result = await handleNewLogin('discord', 'login-code-1', 'state-1');
    expect(result.token).toBeTruthy();
    expect(result.returnUrl).toBe('/');

    expect(await countRows('users')).toBe(1);
    expect(await countRows('organizations')).toBe(1);

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'first.user@example.com')
      .executeTakeFirstOrThrow();
    firstUserId = user.id;
    expect(user.name).toBe('First User');
    expect(user.state).toBe('active');

    // The user is a member of the new organization.
    const membership = await db
      .selectFrom('user_organizations')
      .selectAll()
      .where('user_id', '=', user.id)
      .executeTakeFirstOrThrow();
    const organization = await db
      .selectFrom('organizations')
      .selectAll()
      .where('id', '=', membership.organization_id)
      .executeTakeFirstOrThrow();
    expect(organization.name).toBe('Default Organization');

    // The user holds an admin role in that organization.
    const role = await db
      .selectFrom('roles')
      .selectAll()
      .where('organization_id', '=', organization.id)
      .executeTakeFirstOrThrow();
    expect(role.name).toBe('Admin');
    const rolePermission = await db
      .selectFrom('role_permissions')
      .innerJoin('permissions', 'permissions.id', 'role_permissions.permission_id')
      .select('permissions.code')
      .where('role_permissions.role_id', '=', role.id)
      .executeTakeFirstOrThrow();
    expect(rolePermission.code).toBe('admin');
    await db
      .selectFrom('user_roles')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('role_id', '=', role.id)
      .executeTakeFirstOrThrow();

    // The issued token resolves to the user with admin permissions.
    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(user.id);
    expect(auth.permissions).toContain('admin');
    expect(await getEffectivePermissions(user.id)).toContain('admin');
  });

  it('creates a plain user without an organization for the second user', async () => {
    if (!dbAvailable) return;
    fakes.profile = {
      id: 'provider-account-2',
      email: 'second.user@example.com',
      name: 'Second User',
    };
    stageLogin('state-2', '/home');

    const result = await handleNewLogin('google', 'login-code-2', 'state-2');
    expect(result.returnUrl).toBe('/home');

    expect(await countRows('users')).toBe(2);
    expect(await countRows('organizations')).toBe(1);

    const user = await db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'second.user@example.com')
      .executeTakeFirstOrThrow();

    const memberships = await db
      .selectFrom('user_organizations')
      .selectAll()
      .where('user_id', '=', user.id)
      .execute();
    expect(memberships).toHaveLength(0);
    expect(await getEffectivePermissions(user.id)).not.toContain('admin');

    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(user.id);
  });

  it('logs a returning user in without creating a duplicate user', async () => {
    if (!dbAvailable) return;
    fakes.profile = {
      id: 'provider-account-1',
      email: 'first.user@example.com',
      name: 'First User',
    };
    stageLogin('state-3', '/');

    const result = await handleNewLogin('discord', 'login-code-3', 'state-3');

    expect(await countRows('users')).toBe(2);
    expect(await countRows('organizations')).toBe(1);

    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(firstUserId);
    expect(auth.permissions).toContain('admin');
  });

  it('links an account from another provider to the same user by email', async () => {
    if (!dbAvailable) return;
    fakes.profile = {
      id: 'provider-account-3',
      email: 'first.user@example.com',
      name: 'First User',
    };
    stageLogin('state-4', '/');

    const result = await handleNewLogin('microsoft', 'login-code-4', 'state-4');

    expect(await countRows('users')).toBe(2);

    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(firstUserId);

    const accounts = await db
      .selectFrom('auth_accounts')
      .select('provider')
      .where('user_id', '=', firstUserId)
      .execute();
    expect(accounts.map(account => account.provider).sort()).toEqual(['discord', 'microsoft']);
  });
});
