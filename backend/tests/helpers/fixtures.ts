import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../../src/database.js';

/**
 * Truncates every table except `permissions` (seeded once by the global
 * setup) and `pgmigrations`. Call in a `beforeEach` hook so every test
 * starts from an empty database; a seed failure then fails the test instead
 * of being masked by an early return.
 */
export async function resetDatabase(): Promise<void> {
  const result = await sql<{ tablename: string }>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT IN ('permissions', 'pgmigrations')
  `.execute(db);
  const tables = result.rows.map(row => `"${row.tablename}"`);
  if (tables.length > 0) {
    await sql.raw(`TRUNCATE ${tables.join(', ')} CASCADE`).execute(db);
  }
}

export interface TestUser {
  id: string;
  token: string;
  email: string;
}

/** Inserts a user with an access token. */
export async function createUser(name: string): Promise<TestUser> {
  const id = randomUUID();
  const token = randomUUID();
  const suffix = randomUUID();
  const email = `${name.toLowerCase().replaceAll(' ', '-')}-${suffix}@example.com`;
  await db.insertInto('users').values({ id, name, email }).execute();
  await db.insertInto('access_tokens').values({ user_id: id, token }).execute();
  return { id, token, email };
}

/** Links an OAuth login method to a user. */
export async function createAuthAccount(
  userId: string,
  provider: 'discord' | 'google' | 'microsoft',
  providerAccountId: string,
): Promise<void> {
  await db
    .insertInto('auth_accounts')
    .values({
      user_id: userId,
      provider,
      provider_account_id: providerAccountId,
      access_token: `token-${providerAccountId}`,
    })
    .execute();
}

/** Inserts an organization and returns its id. */
export async function createOrganization(
  name: string,
  options: { id?: string; defaultTimezone?: string } = {},
): Promise<string> {
  const id = options.id ?? randomUUID();
  await db
    .insertInto('organizations')
    .values({
      id,
      name,
      ...(options.defaultTimezone ? { default_timezone: options.defaultTimezone } : {}),
    })
    .execute();
  return id;
}

/** Inserts a calendar into an organization and returns its id. */
export async function createCalendar(organizationId: string, name: string): Promise<string> {
  const id = randomUUID();
  await db.insertInto('calendars').values({ id, name, organization_id: organizationId }).execute();
  return id;
}

/** Adds a user to an organization. */
export async function addUserToOrganization(userId: string, organizationId: string): Promise<void> {
  await db
    .insertInto('user_organizations')
    .values({ user_id: userId, organization_id: organizationId })
    .execute();
}

/** Creates a role with the given permission codes and returns its id. */
export async function createRole(
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

/** Assigns a role to a user. */
export async function assignRole(userId: string, roleId: number): Promise<void> {
  await db.insertInto('user_roles').values({ user_id: userId, role_id: roleId }).execute();
}
