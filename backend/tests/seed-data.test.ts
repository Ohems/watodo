import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedTestData } from '../scripts/seed-data.js';
import { db } from '../src/database.js';
import { resetDatabase } from './helpers/fixtures.js';

// Verifies that the data seed script creates the expected number of rows in
// every summary table. Runs the exported seedTestData against PGlite after
// establishing the precondition (exactly one user and one organization).

beforeEach(async () => {
  await resetDatabase();
  // Precondition: exactly one user and one organization (as after first login).
  const userId = randomUUID();
  await db
    .insertInto('users')
    .values({ id: userId, email: 'seed@example.com', name: 'Seed User' })
    .execute();
  const orgId = randomUUID();
  await db
    .insertInto('organizations')
    .values({ id: orgId, name: 'Default Organization' })
    .execute();
  await db
    .insertInto('user_organizations')
    .values({ user_id: userId, organization_id: orgId })
    .execute();
});

async function countRows(table: string): Promise<number> {
  const row = await db
    .selectFrom(table as never)
    .select(db.fn.countAll().as('count'))
    .executeTakeFirstOrThrow();
  return Number((row as unknown as { count: number | string }).count);
}

describe('seed-data script', () => {
  it('creates the expected number of rows in every table', async () => {
    await db.transaction().execute(seedTestData);

    const expected: Record<string, number> = {
      users: 17,
      organizations: 2,
      roles: 6,
      role_permissions: 12,
      user_roles: 17,
      teams: 5,
      team_members: 13,
      sites: 6,
      rooms: 12,
      work_roles: 7,
      certifications: 6,
      user_work_roles: 14,
      user_certifications: 6,
      certification_work_roles: 4,
      notifications: 7,
      calendars: 4,
      event_types: 8,
      event_type_roles: 4,
      event_series: 16,
      event_series_teams: 7,
      event_occurrences: 6,
      event_work_roles: 29,
      event_work_role_assignments: 20,
      event_comments: 10,
      operations: 5,
      op_assignments: 12,
    };

    for (const [table, expectedCount] of Object.entries(expected)) {
      expect(await countRows(table), `row count for ${table}`).toBe(expectedCount);
    }
  });

  it('materializes occurrences with stable IDs and inherited slots', async () => {
    await db.transaction().execute(seedTestData);

    // Every occurrence-scoped slot must reference a materialized occurrence.
    const allSlots = await db
      .selectFrom('event_work_roles')
      .select(['id', 'event_occurrence_id'])
      .where('event_occurrence_id', 'is not', null)
      .execute();
    const occIds = new Set(
      (await db.selectFrom('event_occurrences').select('id').execute()).map(r => r.id),
    );
    const orphanSlots = allSlots.filter(
      s => s.event_occurrence_id !== null && !occIds.has(s.event_occurrence_id),
    );
    expect(orphanSlots).toHaveLength(0);

    // At least one occurrence carries cancel/reschedule state.
    const flagged = await db
      .selectFrom('event_occurrences')
      .selectAll()
      .where(eb => eb.or([eb('is_cancelled', '=', true), eb('override_start', 'is not', null)]))
      .execute();
    expect(flagged.length).toBeGreaterThan(0);
  });
});
