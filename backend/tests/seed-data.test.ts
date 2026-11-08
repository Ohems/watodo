import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { seedTestData } from '../scripts/seed-data.js';
import { db } from '../src/database.js';
import { getOccurrences } from '../src/services/event-service.js';
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
      event_series: 17,
      event_series_teams: 8,
      event_occurrences: 6,
      event_work_roles: 40,
      event_work_role_assignments: 34,
      event_comments: 10,
      absences: 3,
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

  it('seeds teams with leaders, work role and event series assignments', async () => {
    await db.transaction().execute(seedTestData);

    const teams = await db.selectFrom('teams').selectAll().execute();

    // Every team has a leader.
    for (const team of teams) {
      expect(team.team_leader_id).not.toBeNull();
    }

    // At least one team has work roles assigned, and at least one team is
    // assigned to an event series.
    const teamWorkRoles = await db.selectFrom('team_work_roles').selectAll().execute();
    expect(teamWorkRoles.length).toBeGreaterThan(0);
    const teamSeries = await db.selectFrom('event_series_teams').selectAll().execute();
    expect(teamSeries.length).toBeGreaterThan(0);

    // Every team has at least one member with the manager toggle.
    const managers = await db
      .selectFrom('team_members')
      .select(['team_id', db.fn.countAll().as('count')])
      .where('is_manager', '=', true)
      .groupBy('team_id')
      .execute();
    expect(managers.length).toBe(teams.length);
  });

  it('seeds upcoming occurrences the initial user is involved in', async () => {
    await db.transaction().execute(seedTestData);

    const realUser = await db.selectFrom('users').selectAll().executeTakeFirstOrThrow();
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const involved = await getOccurrences(
      now,
      in14Days,
      undefined,
      { scope: 'involved' },
      realUser.id,
    );

    // The Home page "Upcoming events" list is not empty for the initial user.
    expect(involved.length).toBeGreaterThan(0);

    // At least one occurrence where the user is a participant (assigned to a
    // slot), and at least one where they are a manager via a connected team.
    expect(involved.some(o => o.isParticipant)).toBe(true);
    expect(involved.some(o => o.isManager)).toBe(true);

    // At least one managed occurrence flags an unfilled critical slot of a
    // work role the user manages (the warning label on the Home page).
    const warned = involved.find(o => o.managedUnfilledCriticalSlots.length > 0);
    expect(warned).toBeDefined();
    expect(warned?.workRoleSlots.some(s => s.isCritical && s.assigneeCount === 0)).toBe(true);
  });

  it('keeps organization-scoped data within its own organization', async () => {
    await db.transaction().execute(seedTestData);

    // Every event work role slot that links a catalog work role must reference
    // a work role of the same organization as the event series (via calendar).
    const slotRows = await db
      .selectFrom('event_work_roles')
      .innerJoin('event_series', 'event_series.id', 'event_work_roles.event_series_id')
      .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
      .innerJoin('work_roles', 'work_roles.id', 'event_work_roles.work_role_id')
      .select(['work_roles.organization_id as role_org', 'calendars.organization_id as series_org'])
      .execute();
    expect(slotRows.length).toBeGreaterThan(0);
    for (const row of slotRows) {
      expect(row.role_org).toBe(row.series_org);
    }

    // Team work role assignments: team and work role in the same organization.
    const teamRoleRows = await db
      .selectFrom('team_work_roles')
      .innerJoin('teams', 'teams.id', 'team_work_roles.team_id')
      .innerJoin('work_roles', 'work_roles.id', 'team_work_roles.work_role_id')
      .select(['teams.organization_id as team_org', 'work_roles.organization_id as role_org'])
      .execute();
    expect(teamRoleRows.length).toBeGreaterThan(0);
    for (const row of teamRoleRows) {
      expect(row.role_org).toBe(row.team_org);
    }

    // Series team assignments: team and series in the same organization.
    const seriesTeamRows = await db
      .selectFrom('event_series_teams')
      .innerJoin('teams', 'teams.id', 'event_series_teams.team_id')
      .innerJoin('event_series', 'event_series.id', 'event_series_teams.event_series_id')
      .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
      .select(['teams.organization_id as team_org', 'calendars.organization_id as series_org'])
      .execute();
    expect(seriesTeamRows.length).toBeGreaterThan(0);
    for (const row of seriesTeamRows) {
      expect(row.team_org).toBe(row.series_org);
    }

    // Certification work role links: certification and work role in the same
    // organization.
    const certRoleRows = await db
      .selectFrom('certification_work_roles')
      .innerJoin('work_roles', 'work_roles.id', 'certification_work_roles.work_role_id')
      .innerJoin('certifications', 'certifications.id', 'certification_work_roles.certification_id')
      .select([
        'work_roles.organization_id as role_org',
        'certifications.organization_id as cert_org',
      ])
      .execute();
    expect(certRoleRows.length).toBeGreaterThan(0);
    for (const row of certRoleRows) {
      expect(row.cert_org).toBe(row.role_org);
    }
  });
});
