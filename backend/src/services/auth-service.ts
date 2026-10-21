import { randomUUID } from 'node:crypto';
import { sql, type Transaction } from 'kysely';
import { db } from '../database.js';
import type { AuthProvider, Database, User } from '../db/types.js';
import { createLogger } from '../logger.js';
import { PERMISSIONS } from '../permissions.js';
import { getRedisClient } from '../redis.js';
import { getProvider } from './auth-providers/index.js';
import { getEffectivePermissions } from './permission-service.js';

const logger = createLogger('auth-service');

export interface AuthContext {
  token: string;
  user: User;
  permissions: string[];
}

export async function startLogin(
  stateId: string,
  returnUrl: string,
  userAgent: string,
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(
    `login:state:${stateId}`,
    JSON.stringify({ returnUrl, userAgent }),
    'EX',
    20 * 60,
  );
}

async function retrieveLoginSessionState(stateId: string): Promise<{
  returnUrl: string;
  userAgent: string;
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

export async function handleNewLogin(
  provider: AuthProvider,
  loginCode: string,
  stateId: string,
): Promise<{ token: string; returnUrl: string }> {
  logger.debug(`Handling new ${provider} login`);

  const providerDefinition = getProvider(provider);
  const { returnUrl, userAgent } = await retrieveLoginSessionState(stateId);
  const providerToken = await providerDefinition.exchangeCode(loginCode);
  const profile = await providerDefinition.getProfile(providerToken.access_token);

  const email = profile.email ?? `${profile.id}@${provider}.local`;

  return db.transaction().execute(async tx => {
    // Serialize concurrent first logins so that only one of them
    // bootstraps the default organization.
    await sql`SELECT pg_advisory_xact_lock(hashtext('watodo:first-user-bootstrap'))`.execute(tx);

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
