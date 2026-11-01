import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../src/database.js';
import { getAuthContext, handleNewLogin } from '../src/services/auth-service.js';
import { getEffectivePermissions } from '../src/services/permission-service.js';
import { resetDatabase } from './helpers/fixtures.js';

// Integration test for the login flow: mocks the external services (Redis
// login-state storage and the OAuth provider), then verifies against a real
// database that the first user gets an organization and admin rights, and
// that later users do not. Every test resets the database (beforeEach) and
// performs the logins it needs itself, so tests are independent and a broken
// seed fails the test instead of being masked.

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

function stageFirstUser(stateId: string): void {
  fakes.profile = {
    id: 'provider-account-1',
    email: 'first.user@example.com',
    name: 'First User',
  };
  stageLogin(stateId, '/');
}

async function countRows(table: 'users' | 'organizations'): Promise<number> {
  const row = await db
    .selectFrom(table)
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

describe('First login flow', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('creates a user, an organization and admin rights for the first user', async () => {
    stageFirstUser('state-1');

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
    if (!result.token) throw new Error('Expected a login token');
    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(user.id);
    expect(auth.permissions).toContain('admin');
    expect(await getEffectivePermissions(user.id)).toContain('admin');
  });

  it('creates a plain user without an organization for the second user', async () => {
    // Log the first user in so the second one is not the first anymore.
    stageFirstUser('state-1');
    await handleNewLogin('discord', 'login-code-1', 'state-1');

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

    if (!result.token) throw new Error('Expected a login token');
    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(user.id);
  });

  it('logs a returning user in without creating a duplicate user', async () => {
    stageFirstUser('state-1');
    const firstLogin = await handleNewLogin('discord', 'login-code-1', 'state-1');
    if (!firstLogin.token) throw new Error('Expected a login token');
    const firstAuth = await getAuthContext(firstLogin.token);

    stageFirstUser('state-3');
    const result = await handleNewLogin('discord', 'login-code-3', 'state-3');

    expect(await countRows('users')).toBe(1);
    expect(await countRows('organizations')).toBe(1);

    if (!result.token) throw new Error('Expected a login token');
    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(firstAuth.user.id);
    expect(auth.permissions).toContain('admin');
  });

  it('links an account from another provider to the same user by email', async () => {
    stageFirstUser('state-1');
    const firstLogin = await handleNewLogin('discord', 'login-code-1', 'state-1');
    if (!firstLogin.token) throw new Error('Expected a login token');
    const firstAuth = await getAuthContext(firstLogin.token);

    fakes.profile = {
      id: 'provider-account-3',
      email: 'first.user@example.com',
      name: 'First User',
    };
    stageLogin('state-4', '/');

    const result = await handleNewLogin('microsoft', 'login-code-4', 'state-4');

    expect(await countRows('users')).toBe(1);

    if (!result.token) throw new Error('Expected a login token');
    const auth = await getAuthContext(result.token);
    expect(auth.user.id).toBe(firstAuth.user.id);

    const accounts = await db
      .selectFrom('auth_accounts')
      .select('provider')
      .where('user_id', '=', firstAuth.user.id)
      .execute();
    expect(accounts.map(account => account.provider).sort()).toEqual(['discord', 'microsoft']);
  });
});
