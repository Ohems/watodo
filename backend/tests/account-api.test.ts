import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { db } from '../src/database.js';
import { createAuthAccount, createUser, resetDatabase } from './helpers/fixtures.js';

// Integration tests for the self-service account endpoints: updating one's
// own profile, listing and disconnecting login methods, connecting another
// login method through the OAuth link flow, and deleting one's own account.
// The OAuth provider and the Redis login-state storage are mocked; the
// database is real. Every test resets the database (beforeEach) and builds
// its own users, so tests are independent and a broken seed fails the test.

const fakes = vi.hoisted(() => {
  const redisStore = new Map<string, string>();
  const profile = {
    id: 'link-provider-account-1',
    email: 'link.user@example.com',
    name: 'Link User',
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
  PROVIDER_NAMES: { discord: 'Discord', google: 'Google', microsoft: 'Microsoft' },
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

async function listAuthAccounts(userId: string): Promise<{ provider: string }[]> {
  return db
    .selectFrom('auth_accounts')
    .select('provider')
    .where('user_id', '=', userId)
    .orderBy('provider', 'asc')
    .execute();
}

async function countAccessTokens(userId: string): Promise<number> {
  const row = await db
    .selectFrom('access_tokens')
    .select(({ fn }) => fn.countAll().as('count'))
    .where('user_id', '=', userId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function startLinkFlow(
  app: FastifyInstance,
  token: string,
  provider = 'microsoft',
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/auth/${provider}/link`,
    headers: { 'x-token': token },
    payload: { returnUrl: '/account' },
  });
  expect(response.statusCode).toBe(200);
  const { authorizationUrl } = response.json();
  const state = new URL(authorizationUrl).searchParams.get('state');
  if (!state) throw new Error('No state in the authorization URL');
  return state;
}

describe('Account API', () => {
  let app: FastifyInstance;
  let userId = '';
  let userEmail = '';
  let token = '';
  let otherUserEmail = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  beforeEach(async () => {
    await resetDatabase();
    // The main user has a discord and a google login method; the other user
    // has a discord login method.
    const main = await createUser('Account User');
    const other = await createUser('Other User');
    await createAuthAccount(main.id, 'discord', 'main-discord-1');
    await createAuthAccount(main.id, 'google', 'main-google-1');
    await createAuthAccount(other.id, 'discord', 'other-discord-1');
    userId = main.id;
    userEmail = main.email;
    token = main.token;
    otherUserEmail = other.email;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('PATCH /api/v1/users/@me', () => {
    it('lets a user update their own personal information without user-management permissions', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: {
          name: 'Renamed User',
          email: 'renamed@example.com',
          description: 'About me',
          phoneNumber: '+358401234567',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('Renamed User');
      expect(body.email).toBe('renamed@example.com');
      expect(body.description).toBe('About me');
      expect(body.phoneNumber).toBe('+358401234567');
      expect(body.isEmployed).toBe(false);
      expect(body.createdAt).toBeTruthy();

      const row = await db
        .selectFrom('users')
        .select(['name', 'email', 'description', 'phone_number'])
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(row.name).toBe('Renamed User');
      expect(row.email).toBe('renamed@example.com');
      expect(row.description).toBe('About me');
      expect(row.phone_number).toBe('+358401234567');
    });

    it('rejects a phone number without a country code', async () => {
      // Set a valid phone number first so the rejection has something to keep.
      const valid = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { phoneNumber: '+358401234567' },
      });
      expect(valid.statusCode).toBe(200);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { phoneNumber: '0401234567' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Validation error');
      const details = response.json().details as Array<{ path: string[]; message: string }>;
      const phoneIssue = details.find(issue => issue.path.includes('phoneNumber'));
      expect(phoneIssue?.message).toContain('country code');

      const row = await db
        .selectFrom('users')
        .select('phone_number')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(row.phone_number).toBe('+358401234567');
    });

    it('clears the phone number with null', async () => {
      // Set a phone number first so clearing it is meaningful.
      const valid = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { phoneNumber: '+358401234567' },
      });
      expect(valid.statusCode).toBe(200);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { phoneNumber: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().phoneNumber).toBeNull();

      const row = await db
        .selectFrom('users')
        .select('phone_number')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(row.phone_number).toBeNull();
    });

    it('does not let a user change their own account state', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { name: 'State Changer', state: 'inactive' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('State Changer');

      const row = await db
        .selectFrom('users')
        .select('state')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();
      expect(row.state).toBe('active');
    });

    it('rejects invalid payloads', async () => {
      const invalidEmail = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { email: 'not-an-email' },
      });
      expect(invalidEmail.statusCode).toBe(400);

      const emptyName = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { name: '' },
      });
      expect(emptyName.statusCode).toBe(400);
    });

    it('rejects an email address that is already in use', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
        payload: { email: otherUserEmail },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('already exists');
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/users/@me',
        payload: { name: 'Nope' },
      });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/users/@me', () => {
    it('returns the current user in the serialized shape', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.id).toBe(userId);
      expect(body.name).toBeTruthy();
      expect(body.email).toBeTruthy();
      expect(body.phoneNumber).toBeNull();
      expect(body.isEmployed).toBe(false);
      expect(body.isSuspended).toBe(false);
      expect(body.isBlocked).toBe(false);
      expect(body.createdAt).toBeTruthy();
      expect(body.updatedAt).toBeTruthy();
      expect(body.permissions).toEqual([]);
    });
  });

  describe('GET /api/v1/users/@me/auth-accounts', () => {
    it('lists the connected login methods without exposing tokens', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/auth-accounts',
        headers: { 'x-token': token },
      });

      expect(response.statusCode).toBe(200);
      const accounts = response.json();
      expect(accounts.map((account: { provider: string }) => account.provider).sort()).toEqual([
        'discord',
        'google',
      ]);
      for (const account of accounts) {
        expect(account.providerAccountId).toBeTruthy();
        expect(account.createdAt).toBeTruthy();
        expect(account.accessToken).toBeUndefined();
        expect(account.access_token).toBeUndefined();
      }
    });

    it("does not list other users' login methods", async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me/auth-accounts',
        headers: { 'x-token': token },
      });
      const ids = response
        .json()
        .map((account: { providerAccountId: string }) => account.providerAccountId);
      expect(ids).not.toContain('other-discord-1');
    });

    it('requires authentication', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/v1/users/@me/auth-accounts' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /api/v1/users/@me/auth-accounts/:provider', () => {
    it('disconnects a login method', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/auth-accounts/google',
        headers: { 'x-token': token },
      });

      expect(response.statusCode).toBe(200);
      const accounts = await listAuthAccounts(userId);
      expect(accounts.map(account => account.provider)).toEqual(['discord']);
    });

    it('refuses to disconnect the last login method', async () => {
      // Remove the google login method so discord is the last one.
      const disconnect = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/auth-accounts/google',
        headers: { 'x-token': token },
      });
      expect(disconnect.statusCode).toBe(200);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/auth-accounts/discord',
        headers: { 'x-token': token },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('last login method');
      const accounts = await listAuthAccounts(userId);
      expect(accounts.map(account => account.provider)).toEqual(['discord']);
    });

    it('returns 404 for a login method that is not connected', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/auth-accounts/microsoft',
        headers: { 'x-token': token },
      });

      expect(response.statusCode).toBe(404);
    });

    it('rejects an unsupported provider', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me/auth-accounts/twitter',
        headers: { 'x-token': token },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/auth/:provider/link', () => {
    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/microsoft/link',
        payload: { returnUrl: '/account' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects an unsupported provider', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/twitter/link',
        headers: { 'x-token': token },
        payload: { returnUrl: '/account' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('starts an OAuth flow bound to the current user', async () => {
      const state = await startLinkFlow(app, token);

      const stored = fakes.redisStore.get(`login:state:${state}`);
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored as string);
      expect(parsed.returnUrl).toBe('/account');
      expect(parsed.linkToken).toBe(token);
    });
  });

  describe('GET /api/v1/auth/:provider/callback', () => {
    it('links the provider account to the current user after the OAuth callback', async () => {
      const tokensBefore = await countAccessTokens(userId);
      fakes.profile = {
        id: 'main-microsoft-1',
        email: userEmail,
        name: 'Account User',
      };

      const state = await startLinkFlow(app, token);
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/microsoft/callback?code=login-code&state=${state}`,
      });

      // No new login session is created: no cookie, no new access token.
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/account');
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(await countAccessTokens(userId)).toBe(tokensBefore);

      const accounts = await listAuthAccounts(userId);
      expect(accounts.map(account => account.provider)).toEqual(['discord', 'google', 'microsoft']);

      const linked = await db
        .selectFrom('auth_accounts')
        .selectAll()
        .where('user_id', '=', userId)
        .where('provider', '=', 'microsoft')
        .executeTakeFirstOrThrow();
      expect(linked.provider_account_id).toBe('main-microsoft-1');

      // The existing session is untouched and still works.
      const me = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: { 'x-token': token },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().id).toBe(userId);
    });

    it('refuses to link a provider account that belongs to a different user', async () => {
      fakes.profile = {
        id: 'other-discord-1',
        email: otherUserEmail,
        name: 'Other User',
      };

      const state = await startLinkFlow(app, token, 'discord');
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/discord/callback?code=login-code&state=${state}`,
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location.startsWith('/account?linkError=')).toBe(true);
      expect(decodeURIComponent(location)).toContain('already connected to a different user');

      // Nothing was linked and no session was created.
      const accounts = await listAuthAccounts(userId);
      expect(accounts.map(account => account.provider)).toEqual(['discord', 'google']);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('reports an expired linking session', async () => {
      fakes.profile = {
        id: 'main-microsoft-1',
        email: userEmail,
        name: 'Account User',
      };

      // Stage a link flow whose token no longer exists.
      const state = randomUUID();
      fakes.redisStore.set(
        `login:state:${state}`,
        JSON.stringify({ returnUrl: '/account', userAgent: 'vitest', linkToken: 'gone-token' }),
      );

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/auth/microsoft/callback?code=login-code&state=${state}`,
      });

      expect(response.statusCode).toBe(302);
      const location = response.headers.location as string;
      expect(location.startsWith('/account?linkError=')).toBe(true);
      expect(decodeURIComponent(location)).toContain('expired');
    });
  });

  describe('DELETE /api/v1/users/@me', () => {
    it('requires authentication', async () => {
      const response = await app.inject({ method: 'DELETE', url: '/api/v1/users/@me' });
      expect(response.statusCode).toBe(401);
    });

    it('deletes the user, their login methods and their sessions', async () => {
      const throwaway = await createUser('Throwaway User');
      await createAuthAccount(throwaway.id, 'discord', 'throwaway-discord-1');

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/users/@me',
        headers: { 'x-token': throwaway.token },
      });
      expect(response.statusCode).toBe(200);

      const user = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', throwaway.id)
        .executeTakeFirst();
      expect(user).toBeUndefined();

      const accounts = await db
        .selectFrom('auth_accounts')
        .select('id')
        .where('user_id', '=', throwaway.id)
        .execute();
      expect(accounts).toHaveLength(0);

      // The deleted user's token no longer authenticates.
      const me = await app.inject({
        method: 'GET',
        url: '/api/v1/users/@me',
        headers: { 'x-token': throwaway.token },
      });
      expect(me.statusCode).toBe(403);
    });
  });
});
