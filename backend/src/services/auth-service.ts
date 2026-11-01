import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { db, pglite } from '../database.js';
import type { AuthAccount, AuthProvider, Database, User } from '../db/types.js';
import { badRequest, notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import { PERMISSIONS } from '../permissions.js';
import { getRedisClient } from '../redis.js';
import {
  getProvider,
  PROVIDER_NAMES,
  type ProviderProfile,
  type ProviderTokenResponse,
} from './auth-providers/index.js';
import { getEffectivePermissions } from './permission-service.js';

const logger = createLogger('auth-service');

export interface AuthContext {
  token: string;
  user: User;
  permissions: string[];
}

/**
 * Stores the state of a login (or account-linking) flow. When `linkToken` is
 * given, the flow connects the provider account to the user owning that
 * access token instead of starting a new login session.
 */
export async function startLogin(
  stateId: string,
  returnUrl: string,
  userAgent: string,
  linkToken?: string,
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(
    `login:state:${stateId}`,
    JSON.stringify({ returnUrl, userAgent, linkToken }),
    'EX',
    20 * 60,
  );
}

async function retrieveLoginSessionState(stateId: string): Promise<{
  returnUrl: string;
  userAgent: string;
  linkToken?: string;
}> {
  const redis = getRedisClient();
  const key = `login:state:${stateId}`;
  const exists = await redis.exists(key);
  if (!exists) {
    throw new Error('Session state does not exist or has expired!');
  }
  const stateStr = await redis.get(key);
  await redis.del(key);
  return JSON.parse(stateStr as string);
}

/**
 * The very first user of the system gets an organization of their own and
 * full admin rights over it.
 */
async function bootstrapFirstUser(tx: Transaction<Database>, userId: string): Promise<void> {
  logger.info(`Bootstrapping first user ${userId} with an organization and admin role`);

  const organization = await tx
    .insertInto('organizations')
    .values({ name: 'Default Organization' })
    .returningAll()
    .executeTakeFirstOrThrow();

  await tx
    .insertInto('user_organizations')
    .values({ user_id: userId, organization_id: organization.id })
    .execute();

  const adminPermission = await tx
    .selectFrom('permissions')
    .select('id')
    .where('code', '=', PERMISSIONS.ADMIN)
    .executeTakeFirst();
  if (!adminPermission) {
    throw new Error(`The '${PERMISSIONS.ADMIN}' permission is not seeded!`);
  }

  const role = await tx
    .insertInto('roles')
    .values({ organization_id: organization.id, name: 'Admin' })
    .returningAll()
    .executeTakeFirstOrThrow();

  await tx
    .insertInto('role_permissions')
    .values({ role_id: role.id, permission_id: adminPermission.id })
    .execute();

  await tx.insertInto('user_roles').values({ user_id: userId, role_id: role.id }).execute();

  await tx
    .insertInto('calendars')
    .values({ name: 'Default Calendar', organization_id: organization.id })
    .execute();

  logger.info(`Created organization ${organization.id} with an admin role for user ${userId}`);
}

export interface LoginResult {
  /** The new access token, or null for account-linking flows. */
  token: string | null;
  returnUrl: string;
  /** Set when an account-linking flow failed; the user is redirected back with this message. */
  error?: string;
}

/**
 * Connects a provider account to the user owning the given access token
 * (the account-linking flow started from the account page) instead of
 * starting a new login session. Never issues a token and never creates users.
 */
async function linkProviderAccount(
  provider: AuthProvider,
  profile: ProviderProfile,
  providerToken: ProviderTokenResponse,
  linkToken: string,
  returnUrl: string,
): Promise<LoginResult> {
  const session = await db
    .selectFrom('access_tokens')
    .innerJoin('users', 'users.id', 'access_tokens.user_id')
    .selectAll('users')
    .where('access_tokens.token', '=', linkToken)
    .executeTakeFirst();

  if (session?.state !== 'active') {
    return {
      token: null,
      returnUrl,
      error: 'The account linking session has expired. Please try again.',
    };
  }

  const userId = session.id;

  return db.transaction().execute(async tx => {
    const existing = await tx
      .selectFrom('auth_accounts')
      .selectAll()
      .where('provider', '=', provider)
      .where('provider_account_id', '=', profile.id)
      .executeTakeFirst();

    if (existing && existing.user_id !== userId) {
      return {
        token: null,
        returnUrl,
        error: `This ${PROVIDER_NAMES[provider]} account is already connected to a different user.`,
      };
    }

    if (existing) {
      await tx
        .updateTable('auth_accounts')
        .set({
          access_token: providerToken.access_token,
          refresh_token: providerToken.refresh_token ?? null,
          expires_in: providerToken.expires_in,
          updated_at: new Date(),
        })
        .where('id', '=', existing.id)
        .execute();
      logger.info(`Refreshed ${provider} account link for user ${userId}`);
    } else {
      logger.info(`Linking ${provider} account ${profile.id} to user ${userId}`);
      await tx
        .insertInto('auth_accounts')
        .values({
          user_id: userId,
          provider,
          provider_account_id: profile.id,
          access_token: providerToken.access_token,
          refresh_token: providerToken.refresh_token ?? null,
          expires_in: providerToken.expires_in,
        })
        .execute();
    }

    return { token: null, returnUrl };
  });
}

export async function handleNewLogin(
  provider: AuthProvider,
  loginCode: string,
  stateId: string,
): Promise<LoginResult> {
  logger.debug(`Handling new ${provider} login`);

  const providerDefinition = getProvider(provider);
  const { returnUrl, userAgent, linkToken } = await retrieveLoginSessionState(stateId);
  const providerToken = await providerDefinition.exchangeCode(loginCode);
  const profile = await providerDefinition.getProfile(providerToken.access_token);

  if (linkToken) {
    return linkProviderAccount(provider, profile, providerToken, linkToken, returnUrl);
  }

  const email = profile.email ?? `${profile.id}@${provider}.local`;

  return db.transaction().execute(async tx => {
    // Serialize concurrent first logins so that only one of them
    // bootstraps the default organization. The advisory lock is only needed
    // on a multi-connection database; PGlite (tests) is single-connection and
    // does not support advisory locks.
    if (!pglite) {
      await sql`SELECT pg_advisory_xact_lock(hashtext('watodo:first-user-bootstrap'))`.execute(tx);
    }

    // Find the user through an existing linked account, or link by email,
    // or create a new user.
    const account = await tx
      .selectFrom('auth_accounts')
      .selectAll()
      .where('provider', '=', provider)
      .where('provider_account_id', '=', profile.id)
      .executeTakeFirst();

    let user: User | undefined;
    if (account) {
      user = await tx
        .selectFrom('users')
        .selectAll()
        .where('id', '=', account.user_id)
        .executeTakeFirst();
    } else {
      user = await tx.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
    }

    if (!user) {
      const userCount = await tx
        .selectFrom('users')
        .select(({ fn }) => fn.countAll().as('count'))
        .executeTakeFirstOrThrow();

      logger.info(`Creating new user: ${profile.name ?? email} (${provider} ID: ${profile.id})`);
      user = await tx
        .insertInto('users')
        .values({ name: profile.name ?? email, email })
        .returningAll()
        .executeTakeFirstOrThrow();

      if (Number(userCount.count) === 0) {
        await bootstrapFirstUser(tx, user.id);
      }
    }

    if (account) {
      await tx
        .updateTable('auth_accounts')
        .set({
          access_token: providerToken.access_token,
          refresh_token: providerToken.refresh_token ?? null,
          expires_in: providerToken.expires_in,
          updated_at: new Date(),
        })
        .where('id', '=', account.id)
        .execute();
    } else {
      logger.info(`Linking ${provider} account ${profile.id} to user ${user.id}`);
      await tx
        .insertInto('auth_accounts')
        .values({
          user_id: user.id,
          provider,
          provider_account_id: profile.id,
          access_token: providerToken.access_token,
          refresh_token: providerToken.refresh_token ?? null,
          expires_in: providerToken.expires_in,
        })
        .execute();
    }

    const accessToken = await tx
      .insertInto('access_tokens')
      .values({
        user_id: user.id,
        token: randomUUID(),
        user_agent: userAgent,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return { token: accessToken.token, returnUrl };
  });
}

async function refreshExpiringProviderTokens(userId: string): Promise<void> {
  const accounts = await db
    .selectFrom('auth_accounts')
    .selectAll()
    .where('user_id', '=', userId)
    .execute();

  for (const account of accounts) {
    if (!account.refresh_token || !account.expires_in) continue;

    const tokenAge = Date.now() - account.updated_at.getTime();
    const halfLife = (account.expires_in * 1000) / 2;
    if (tokenAge <= halfLife) continue;

    logger.info(`Refreshing ${account.provider} token for user ${userId}`);
    try {
      const newToken = await getProvider(account.provider).refreshAccessToken(
        account.refresh_token,
      );
      await db
        .updateTable('auth_accounts')
        .set({
          access_token: newToken.access_token,
          refresh_token: newToken.refresh_token ?? account.refresh_token,
          expires_in: newToken.expires_in,
          updated_at: new Date(),
        })
        .where('id', '=', account.id)
        .execute();
    } catch (error) {
      logger.warn({ error }, `Failed to refresh ${account.provider} token`);
    }
  }
}

export async function getAuthContext(tokenString: string): Promise<AuthContext> {
  const user = await db
    .selectFrom('access_tokens')
    .innerJoin('users', 'users.id', 'access_tokens.user_id')
    .selectAll('users')
    .where('access_tokens.token', '=', tokenString)
    .executeTakeFirst();

  if (!user) {
    throw new Error('Invalid token!');
  }

  if (user.state !== 'active') {
    throw new Error(`User ${user.id} has been set as inactive!`);
  }

  await refreshExpiringProviderTokens(user.id);

  const permissions = await getEffectivePermissions(user.id);

  return { token: tokenString, user, permissions };
}

export async function logout(tokenString: string): Promise<void> {
  logger.info('Processing user logout');

  const accessToken = await db
    .selectFrom('access_tokens')
    .selectAll()
    .where('token', '=', tokenString)
    .executeTakeFirst();

  if (!accessToken) {
    throw new Error('No access token found!');
  }

  await db.deleteFrom('access_tokens').where('token', '=', tokenString).execute();

  const remainingResult = await db
    .selectFrom('access_tokens')
    .select(({ fn }) => fn.countAll().as('count'))
    .where('user_id', '=', accessToken.user_id)
    .executeTakeFirstOrThrow();

  const remainingTokens = Number(remainingResult.count);
  logger.debug(`User has ${remainingTokens} login locations left`);

  if (remainingTokens === 0) {
    const accounts = await db
      .selectFrom('auth_accounts')
      .selectAll()
      .where('user_id', '=', accessToken.user_id)
      .execute();

    for (const account of accounts) {
      const provider = getProvider(account.provider);
      if (account.access_token && provider.revokeToken) {
        logger.info(`Invalidating ${account.provider} token for user ${accessToken.user_id}`);
        await provider
          .revokeToken(account.access_token)
          .catch(error => logger.warn({ error }, `Failed to revoke ${account.provider} token`));
      }
      // Keep the account link so the user can log in again; only drop the tokens.
      await db
        .updateTable('auth_accounts')
        .set({ access_token: null, refresh_token: null, expires_in: null, updated_at: new Date() })
        .where('id', '=', account.id)
        .execute();
    }
  }
}

/** Best-effort revocation of a stored provider token; failures are logged, not thrown. */
async function revokeProviderToken(account: AuthAccount): Promise<void> {
  const provider = getProvider(account.provider);
  if (account.access_token && provider.revokeToken) {
    await provider
      .revokeToken(account.access_token)
      .catch(error => logger.warn({ error }, `Failed to revoke ${account.provider} token`));
  }
}

export interface AuthAccountInfo {
  provider: AuthProvider;
  providerAccountId: string;
  createdAt: string;
}

/**
 * Lists the login methods connected to a user's account. Never exposes the
 * stored provider tokens.
 */
export async function getAuthAccounts(userId: string): Promise<AuthAccountInfo[]> {
  logger.trace('authService.getAuthAccounts');

  const accounts = await db
    .selectFrom('auth_accounts')
    .select(['provider', 'provider_account_id', 'created_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'asc')
    .execute();

  return accounts.map(account => ({
    provider: account.provider,
    providerAccountId: account.provider_account_id,
    createdAt: account.created_at.toISOString(),
  }));
}

/**
 * Disconnects a login method from the user's account. The last remaining
 * login method cannot be removed, otherwise the user could not log in again.
 */
export async function unlinkAuthAccount(userId: string, provider: AuthProvider): Promise<void> {
  logger.trace('authService.unlinkAuthAccount');

  const accounts = await db
    .selectFrom('auth_accounts')
    .selectAll()
    .where('user_id', '=', userId)
    .execute();

  const account = accounts.find(row => row.provider === provider);
  if (!account) {
    throw notFound(`No ${PROVIDER_NAMES[provider]} account is connected!`);
  }
  if (accounts.length <= 1) {
    throw badRequest('You cannot disconnect your last login method!');
  }

  await revokeProviderToken(account);
  await db.deleteFrom('auth_accounts').where('id', '=', account.id).execute();
}

/**
 * Permanently deletes a user's account. Provider tokens are revoked
 * best-effort; deleting the user cascades to their login methods, access
 * tokens and other user-owned rows.
 */
export async function deleteAccount(userId: string): Promise<void> {
  logger.info(`Deleting account of user ${userId}`);

  const accounts = await db
    .selectFrom('auth_accounts')
    .selectAll()
    .where('user_id', '=', userId)
    .execute();

  for (const account of accounts) {
    await revokeProviderToken(account);
  }

  const result = await db.deleteFrom('users').where('id', '=', userId).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw notFound(`User ${userId} not found!`);
  }
}
