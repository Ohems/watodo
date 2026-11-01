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
      role_permissions: 10,
      user_roles: 17,
      teams: 6,
      team_members: 15,
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
      event_work_roles: 37,
      event_work_role_assignments: 32,
      event_comments: 10,
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

  it('seeds teams of every type with leaders and links', async () => {
    await db.transaction().execute(seedTestData);

    const teams = await db.selectFrom('teams').selectAll().execute();
    const byType = new Map<string, number>();
    for (const team of teams) {
      byType.set(team.team_type, (byType.get(team.team_type) ?? 0) + 1);
    }
    expect(byType.get('general')).toBeGreaterThan(0);
    expect(byType.get('event_organizers')).toBeGreaterThan(0);
    expect(byType.get('role_group')).toBeGreaterThan(0);

    // Every team has a leader, and the links match the team type.
    for (const team of teams) {
      expect(team.team_leader_id).not.toBeNull();
      if (team.team_type === 'event_organizers') {
        expect(team.event_type_id).not.toBeNull();
        expect(team.work_role_id).toBeNull();
      } else if (team.team_type === 'role_group') {
        expect(team.work_role_id).not.toBeNull();
        expect(team.event_type_id).toBeNull();
      } else {
        expect(team.event_type_id).toBeNull();
        expect(team.work_role_id).toBeNull();
      }
    }

    // Every team has at least one member with the manager toggle.
    const managers = await db
      .selectFrom('team_members')
      .select(['team_id', db.fn.countAll().as('count')])
      .where('is_manager', '=', true)
      .groupBy('team_id')
      .execute();
    expect(managers.length).toBe(teams.length);
  });
});
