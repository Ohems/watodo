// Generates semi-realistic test data into the DATABASE_URL database for
// development and manual testing. Run from backend/ with `npm run seed:data`.
//
// The script only runs on a fresh database: it refuses to seed unless there is
// exactly one user and one organization, because those are created by the
// first login (see handleNewLogin in src/services/auth-service.ts). It then
// creates a second organization and fills both organizations with mock users
// (no login accounts attached), roles, teams, sites with rooms, calendars,
// event types, event series across the previous, current and next month (with
// exceptions, job slots, assignments and comments), and a set of operations.
//
// When a feature that persists data is added, extend this script so the seed
// data keeps covering it (see AGENTS.md).

import type { Kysely, Transaction } from 'kysely';
import { db, disconnectDatabase } from '../src/database.js';
import type {
  Calendar,
  Database,
  EventSeries,
  EventWorkRole,
  NewEventSeries,
  Role,
  Room,
  Site,
  User,
} from '../src/db/types.js';
import { createLogger } from '../src/logger.js';
import { PERMISSIONS, type Permission } from '../src/permissions.js';
import { seedPermissions } from '../src/services/permission-service.js';
import {
  buildRruleString,
  expandOccurrences,
  fromWallClockDate,
  type RecurrenceSeriesRule,
  toWallClockDate,
} from '../src/services/recurrence.js';

const logger = createLogger('seed-data');

type Tx = Transaction<Database>;
type Executor = Kysely<Database> | Transaction<Database>;

interface MockUserSeed {
  name: string;
  email: string;
  description: string;
  /** E.164 phone number (includes the country code); null when not set. */
  phoneNumber: string | null;
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  state: 'active' | 'inactive';
}

// Mock users have no auth accounts: they cannot log in, they only exist so
// that role assignments, job assignments and comments have someone to point at.
const MOCK_USERS_ORG_ONE: MockUserSeed[] = [
  {
    name: 'Anna Korhonen',
    email: 'anna.korhonen@example.com',
    phoneNumber: '+358401234567',
    description: 'Coordinates the weekly community meetings and keeps the calendar up to date.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Mikko Virtanen',
    email: 'mikko.virtanen@example.com',
    phoneNumber: '+358441234567',
    description: 'Handles logistics, deliveries and equipment.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Liisa Mäkinen',
    email: 'liisa.makinen@example.com',
    phoneNumber: null,
    description: 'Runs the community kitchen and the weekly lunch.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Jukka Nieminen',
    email: 'jukka.nieminen@example.com',
    phoneNumber: '+358451234567',
    description: 'Takes care of the sports grounds and bookings.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Sanna Saarinen',
    email: 'sanna.saarinen@example.com',
    phoneNumber: '+358501234567',
    description: 'Organizes family and youth events.',
    isEmployed: false,
    isSuspended: true,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Ville Lehtonen',
    email: 'ville.lehtonen@example.com',
    phoneNumber: '+358401234568',
    description: 'Helps out at events when he has time.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'inactive',
  },
  {
    name: 'Emilia Järvinen',
    email: 'emilia.jarvinen@example.com',
    phoneNumber: '+358441234568',
    description: 'Likes to help with setup and cleaning.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Antti Hämäläinen',
    email: 'antti.hamalainen@example.com',
    phoneNumber: null,
    description: 'Used to volunteer, blocked after repeated no-shows.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: true,
    state: 'active',
  },
];

const MOCK_USERS_ORG_TWO: MockUserSeed[] = [
  {
    name: 'Sofia Andersson',
    email: 'sofia.andersson@example.com',
    phoneNumber: '+46701234567',
    description: 'Coordinates the association events and the calendar.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Erik Lindqvist',
    email: 'erik.lindqvist@example.com',
    phoneNumber: '+46721234567',
    description: 'Drives the van and handles equipment.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Maria Johansson',
    email: 'maria.johansson@example.com',
    phoneNumber: '+46731234567',
    description: 'Runs the coffee and the weekly raffle.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Lars Bergström',
    email: 'lars.bergstrom@example.com',
    phoneNumber: null,
    description: 'Coaches the junior football team.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Ingrid Nilsson',
    email: 'ingrid.nilsson@example.com',
    phoneNumber: '+46761234567',
    description: 'Organizes the seasonal cleanups.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Oscar Gustafsson',
    email: 'oscar.gustafsson@example.com',
    phoneNumber: '+46701234568',
    description: 'Takes photos at events.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Elsa Holm',
    email: 'elsa.holm@example.com',
    phoneNumber: '+46721234568',
    description: 'Keeps the member list up to date.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'inactive',
  },
  {
    name: 'Johan Söderberg',
    email: 'johan.soderberg@example.com',
    phoneNumber: '+46731234568',
    description: 'New member, has not volunteered yet.',
    isEmployed: false,
    isSuspended: true,
    isBlocked: false,
    state: 'active',
  },
];

interface OperationSeed {
  name: string;
  description: string;
  requirements: string;
  location: string;
  assignments: { name: string; description: string }[];
}

// Operations are not organization-scoped; a shared set exercises the
// operations feature for everyone.
const OPERATION_SEEDS: OperationSeed[] = [
  {
    name: 'Summer Festival',
    description: 'Annual community festival with food stalls, music and games.',
    requirements: 'Volunteer badge and a short orientation.',
    location: 'Central Park',
    assignments: [
      { name: 'Logistics Lead', description: 'Coordinates vendors and deliveries.' },
      { name: 'Security Lead', description: 'Runs the security rota for the festival.' },
      {
        name: 'First Aid Station',
        description: 'Staffs the first aid station. Certified first aiders only.',
      },
      { name: 'Food Stalls', description: 'Runs the food stall area.' },
    ],
  },
  {
    name: 'Weekly Meeting Setup',
    description: 'Prepare the community hall before the weekly meeting.',
    requirements: 'Arrive 30 minutes before the meeting starts.',
    location: 'Community Hall',
    assignments: [
      { name: 'Room Setup', description: 'Arrange the chairs and tables.' },
      { name: 'Coffee and Tea', description: 'Make coffee and tea.' },
      { name: 'AV Check', description: 'Test the projector and microphones.' },
    ],
  },
  {
    name: 'Community Kitchen',
    description: 'Cook and serve the weekly community lunch.',
    requirements: 'Food hygiene certificate.',
    location: 'Community Kitchen',
    assignments: [
      { name: 'Head Cook', description: 'Plans and cooks the main dish.' },
      { name: 'Dishes', description: 'Washes the dishes after the lunch.' },
      { name: 'Shopping', description: 'Buys the ingredients for the lunch.' },
    ],
  },
  {
    name: 'Sports Field Maintenance',
    description: 'Keep the sports grounds in good shape.',
    requirements: '',
    location: 'Sports Grounds',
    assignments: [
      { name: 'Mowing', description: 'Mows the field every week.' },
      { name: 'Line Marking', description: 'Marks the lines before games.' },
    ],
  },
  {
    name: 'Upcoming Fundraiser',
    description: 'Plan the upcoming fundraiser. No assignments yet.',
    requirements: '',
    location: 'To be decided',
    assignments: [],
  },
];

const SUMMARY_TABLES = [
  'users',
  'organizations',
  'roles',
  'role_permissions',
  'user_roles',
  'teams',
  'team_members',
  'sites',
  'rooms',
  'work_roles',
  'certifications',
  'user_work_roles',
  'user_certifications',
  'certification_work_roles',
  'notifications',
  'calendars',
  'event_types',
  'event_type_roles',
  'event_series',
  'event_series_teams',
  'event_occurrences',
  'event_work_roles',
  'event_work_role_assignments',
  'event_comments',
  'operations',
  'op_assignments',
] as const;

const now = new Date();
const thisYear = now.getUTCFullYear();
const thisMonth = now.getUTCMonth();
const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;
const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
const nextYear = thisMonth === 11 ? thisYear + 1 : thisYear;
const nextMonth = thisMonth === 11 ? 0 : thisMonth + 1;
const monthAfterNextYear = nextMonth === 11 ? nextYear + 1 : nextYear;
const monthAfterNextMonth = nextMonth === 11 ? 0 : nextMonth + 1;

// Real instants of the first day of the current, next and following month.
const currentMonthStart = new Date(Date.UTC(thisYear, thisMonth, 1));
const nextMonthStart = new Date(Date.UTC(nextYear, nextMonth, 1));
const monthAfterNextStart = new Date(Date.UTC(monthAfterNextYear, monthAfterNextMonth, 1));

// Real instant of a wall-clock time in `timezone` (month is 0-based).
function at(
  timezone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  return fromWallClockDate(new Date(Date.UTC(year, month, day, hour, minute)), timezone);
}

// Wall-clock date (UTC components) of the first `isoWeekday` (1 = Monday) of
// a month (0-based).
function firstWeekdayOfMonth(year: number, month: number, isoWeekday: number): Date {
  const firstDay = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // 0 = Monday
  const offset = (isoWeekday - 1 - firstDay + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset));
}

async function countRows(executor: Executor, table: keyof Database): Promise<number> {
  const row = await executor
    .selectFrom(table)
    .select(({ fn }) => fn.countAll().as('count'))
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

async function loadPermissionIds(tx: Tx): Promise<Map<string, number>> {
  const rows = await tx.selectFrom('permissions').select(['id', 'code']).execute();
  return new Map(rows.map(row => [row.code, row.id]));
}

function permissionIdList(
  permissionIds: Map<string, number>,
  codes: readonly Permission[],
): number[] {
  return codes.map(code => {
    const id = permissionIds.get(code);
    if (id === undefined) {
      throw new Error(`Permission "${code}" is not seeded! Run "npm run seed:permissions" first.`);
    }
    return id;
  });
}

async function findRole(tx: Tx, organizationId: string, name: string): Promise<Role | undefined> {
  return tx
    .selectFrom('roles')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('name', '=', name)
    .executeTakeFirst();
}

async function createRole(
  tx: Tx,
  organizationId: string,
  name: string,
  description: string,
  permissionIds: number[],
): Promise<Role> {
  const role = await tx
    .insertInto('roles')
    .values({ organization_id: organizationId, name, description })
    .returningAll()
    .executeTakeFirstOrThrow();
  if (permissionIds.length > 0) {
    await tx
      .insertInto('role_permissions')
      .values(
        permissionIds.map(permissionId => ({ role_id: role.id, permission_id: permissionId })),
      )
      .execute();
  }
  return role;
}

async function createMockUsers(tx: Tx, seeds: MockUserSeed[]): Promise<User[]> {
  const users: User[] = [];
  for (const seed of seeds) {
    const user = await tx
      .insertInto('users')
      .values({
        name: seed.name,
        email: seed.email,
        description: seed.description,
        phone_number: seed.phoneNumber,
        is_employed: seed.isEmployed,
        is_suspended: seed.isSuspended,
        is_blocked: seed.isBlocked,
        state: seed.state,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    users.push(user);
  }
  return users;
}

async function createTeams(
  tx: Tx,
  organizationId: string,
  seeds: { name: string; description: string }[],
) {
  const teams = [];
  for (const seed of seeds) {
    const team = await tx
      .insertInto('teams')
      .values({ name: seed.name, description: seed.description, organization_id: organizationId })
      .returningAll()
      .executeTakeFirstOrThrow();
    teams.push(team);
  }
  return teams;
}

async function createCalendar(tx: Tx, organizationId: string, name: string): Promise<Calendar> {
  return tx
    .insertInto('calendars')
    .values({ name, organization_id: organizationId })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function createEventType(
  tx: Tx,
  calendarId: string,
  seed: { name: string; description: string; recurrence: string | null },
) {
  return tx
    .insertInto('event_types')
    .values({
      name: seed.name,
      description: seed.description,
      recurrence: seed.recurrence,
      calendar_id: calendarId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function assignRole(
  tx: Tx,
  userId: string,
  roleId: number,
  teamId: string | null = null,
  eventTypeId: number | null = null,
): Promise<void> {
  await tx
    .insertInto('user_roles')
    .values({ user_id: userId, role_id: roleId, team_id: teamId, event_type_id: eventTypeId })
    .execute();
}

async function createSeries(tx: Tx, values: NewEventSeries): Promise<EventSeries> {
  return tx.insertInto('event_series').values(values).returningAll().executeTakeFirstOrThrow();
}

/**
 * Materializes an occurrence (upsert) and, when newly created, copies the
 * parent (series-level) work role slots - including their user assignments -
 * into the occurrence. Mirrors ensureOccurrenceMaterialized in the service.
 */
async function materializeOccurrence(
  tx: Tx,
  seriesId: number,
  occurrenceStart: Date,
): Promise<number> {
  const occ = await tx
    .insertInto('event_occurrences')
    .values({ event_series_id: seriesId, occurrence_start: occurrenceStart })
    .onConflict(oc => oc.columns(['event_series_id', 'occurrence_start']).doNothing())
    .returning('id')
    .executeTakeFirst();
  if (occ) {
    const parentSlots = await tx
      .selectFrom('event_work_roles')
      .select(['id', 'title', 'description', 'is_critical', 'work_role_id'])
      .where('event_series_id', '=', seriesId)
      .where('event_occurrence_id', 'is', null)
      .execute();
    if (parentSlots.length > 0) {
      const newSlots = await tx
        .insertInto('event_work_roles')
        .values(
          parentSlots.map(s => ({
            event_series_id: seriesId,
            event_occurrence_id: occ.id,
            inherited_from_work_role_id: s.id,
            title: s.title,
            description: s.description,
            is_critical: s.is_critical,
            work_role_id: s.work_role_id,
          })),
        )
        .onConflict(oc => oc.doNothing())
        .returning(['id', 'inherited_from_work_role_id'])
        .execute();
      const parentAssignments = await tx
        .selectFrom('event_work_role_assignments')
        .select(['event_work_role_id', 'user_id'])
        .where(
          'event_work_role_id',
          'in',
          parentSlots.map(s => s.id),
        )
        .execute();
      const newByParent = new Map(
        newSlots
          .filter(s => s.inherited_from_work_role_id !== null)
          .map(s => [s.inherited_from_work_role_id as number, s.id]),
      );
      const rows = parentAssignments
        .map(a => {
          const newId = newByParent.get(a.event_work_role_id);
          return newId !== undefined ? { event_work_role_id: newId, user_id: a.user_id } : null;
        })
        .filter((r): r is { event_work_role_id: number; user_id: string } => r !== null);
      if (rows.length > 0) {
        await tx
          .insertInto('event_work_role_assignments')
          .values(rows)
          .onConflict(oc => oc.doNothing())
          .execute();
      }
    }
    return occ.id;
  }
  const existing = await tx
    .selectFrom('event_occurrences')
    .select('id')
    .where('event_series_id', '=', seriesId)
    .where('occurrence_start', '=', occurrenceStart)
    .executeTakeFirstOrThrow();
  return existing.id;
}

async function addJob(
  tx: Tx,
  seriesId: number,
  occurrenceStart: Date | null,
  title: string,
  description: string,
  isCritical: boolean = false,
  workRoleId: number | null = null,
): Promise<EventWorkRole> {
  // Materialize the occurrence when the slot is scoped to one, so the
  // occurrence gets a stable ID and inherited parent slots.
  const eventOccurrenceId = occurrenceStart
    ? await materializeOccurrence(tx, seriesId, occurrenceStart)
    : null;
  return tx
    .insertInto('event_work_roles')
    .values({
      event_series_id: seriesId,
      event_occurrence_id: eventOccurrenceId,
      title,
      description,
      is_critical: isCritical,
      work_role_id: workRoleId,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function assignUser(tx: Tx, jobId: number, userId: string): Promise<void> {
  await tx
    .insertInto('event_work_role_assignments')
    .values({ event_work_role_id: jobId, user_id: userId })
    .execute();
}

async function addComment(
  tx: Tx,
  seriesId: number,
  occurrenceStart: Date | null,
  userId: string,
  body: string,
): Promise<void> {
  let eventOccurrenceId: number | null = null;
  if (occurrenceStart) {
    eventOccurrenceId = await materializeOccurrence(tx, seriesId, occurrenceStart);
  }
  await tx
    .insertInto('event_comments')
    .values({
      event_series_id: seriesId,
      event_occurrence_id: eventOccurrenceId,
      user_id: userId,
      body,
    })
    .execute();
}

interface SiteSeed {
  name: string;
  description: string | null;
  address: string | null;
  rooms: { name: string; description: string }[];
}

async function createSites(
  tx: Tx,
  organizationId: string,
  seeds: SiteSeed[],
): Promise<{ sites: Site[]; rooms: Room[] }> {
  const sites: Site[] = [];
  const rooms: Room[] = [];
  for (const seed of seeds) {
    const site = await tx
      .insertInto('sites')
      .values({
        name: seed.name,
        description: seed.description,
        address: seed.address,
        organization_id: organizationId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    sites.push(site);
    for (const roomSeed of seed.rooms) {
      const room = await tx
        .insertInto('rooms')
        .values({
          name: roomSeed.name,
          description: roomSeed.description,
          site_id: site.id,
          organization_id: organizationId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      rooms.push(room);
    }
  }
  return { sites, rooms };
}

interface WorkRoleSeed {
  name: string;
  description: string;
}

interface CertificationSeed {
  name: string;
  description: string;
}

async function createWorkRoles(tx: Tx, organizationId: string, seeds: WorkRoleSeed[]) {
  const roles = [];
  for (const seed of seeds) {
    const role = await tx
      .insertInto('work_roles')
      .values({
        name: seed.name,
        description: seed.description,
        organization_id: organizationId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    roles.push(role);
  }
  return roles;
}

async function createCertifications(tx: Tx, organizationId: string, seeds: CertificationSeed[]) {
  const certs = [];
  for (const seed of seeds) {
    const cert = await tx
      .insertInto('certifications')
      .values({
        name: seed.name,
        description: seed.description,
        organization_id: organizationId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    certs.push(cert);
  }
  return certs;
}

async function assignUserToWorkRole(
  tx: Tx,
  userId: string,
  workRoleId: number,
  isQualified: boolean,
  notes = '',
): Promise<void> {
  await tx
    .insertInto('user_work_roles')
    .values({
      user_id: userId,
      work_role_id: workRoleId,
      is_qualified: isQualified,
      notes,
    })
    .execute();
}

async function assignUserCertification(
  tx: Tx,
  userId: string,
  certificationId: number,
  certificationDate: Date | null = null,
  validUntilDate: Date | null = null,
): Promise<void> {
  await tx
    .insertInto('user_certifications')
    .values({
      user_id: userId,
      certification_id: certificationId,
      certification_date: certificationDate,
      valid_until_date: validUntilDate,
    })
    .execute();
}

async function linkCertificationToWorkRole(
  tx: Tx,
  workRoleId: number,
  certificationId: number,
): Promise<void> {
  await tx
    .insertInto('certification_work_roles')
    .values({ work_role_id: workRoleId, certification_id: certificationId })
    .execute();
}

async function addTeamMembers(tx: Tx, teamId: string, userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await tx.insertInto('team_members').values({ team_id: teamId, user_id: userId }).execute();
  }
}

async function assignTeamsToSeries(tx: Tx, seriesId: number, teamIds: string[]): Promise<void> {
  for (const teamId of teamIds) {
    await tx
      .insertInto('event_series_teams')
      .values({ event_series_id: seriesId, team_id: teamId })
      .execute();
  }
}

async function addNotification(
  tx: Tx,
  userId: string,
  organizationId: string,
  title: string,
  body: string,
  isRead: boolean,
): Promise<void> {
  await tx
    .insertInto('notifications')
    .values({ user_id: userId, organization_id: organizationId, title, body, is_read: isRead })
    .execute();
}

interface WeeklyMeetingUsers {
  setup: User;
  coffee: User;
  av: User;
  commenter: User;
  occurrenceCommenter: User;
}

// Creates a weekly recurring series (Mondays 18:00-19:30 local) with
// series-wide and occurrence-specific job slots, one cancelled occurrence in
// the current month and one rescheduled occurrence in the next month, plus
// series-wide and occurrence-specific comments.
async function seedWeeklyMeeting(
  tx: Tx,
  title: string,
  calendarId: string,
  timezone: string,
  users: WeeklyMeetingUsers,
): Promise<void> {
  const startWall = firstWeekdayOfMonth(prevYear, prevMonth, 1);
  const start = at(
    timezone,
    startWall.getUTCFullYear(),
    startWall.getUTCMonth(),
    startWall.getUTCDate(),
    18,
    0,
  );
  const series = await createSeries(tx, {
    title,
    description: 'Recurring weekly meeting. Open to all members.',
    calendar_id: calendarId,
    start,
    duration_minutes: 90,
    rrule: buildRruleString({ start, timezone }, { freq: 'WEEKLY', byWeekdays: [1] }),
    timezone,
  });

  const setupJob = await addJob(
    tx,
    series.id,
    null,
    'Room setup',
    'Open the venue and arrange the chairs before the meeting.',
  );
  await assignUser(tx, setupJob.id, users.setup.id);
  const coffeeJob = await addJob(
    tx,
    series.id,
    null,
    'Coffee and tea',
    'Make sure there is coffee, tea and water for everyone.',
  );
  await assignUser(tx, coffeeJob.id, users.coffee.id);

  const rule: RecurrenceSeriesRule = {
    start: series.start,
    durationMinutes: series.duration_minutes,
    rrule: series.rrule,
    timezone: series.timezone,
  };

  const currentOccurrences = expandOccurrences(rule, [], currentMonthStart, nextMonthStart);
  if (currentOccurrences.length > 0) {
    const occurrence = currentOccurrences[0];
    const avJob = await addJob(
      tx,
      series.id,
      occurrence.occurrenceStart,
      'AV support',
      'Run the projector and the microphones during the meeting.',
    );
    await assignUser(tx, avJob.id, users.av.id);
    await addComment(
      tx,
      series.id,
      occurrence.occurrenceStart,
      users.occurrenceCommenter.id,
      'Please test the microphones before the meeting starts.',
    );
  }

  // Cancel the second occurrence of the current month (a holiday, for example).
  if (currentOccurrences.length > 1) {
    const occId = await materializeOccurrence(tx, series.id, currentOccurrences[1].occurrenceStart);
    await tx
      .updateTable('event_occurrences')
      .set({ is_cancelled: true, updated_at: new Date() })
      .where('id', '=', occId)
      .execute();
  }

  // Reschedule the first occurrence of the next month to the following day.
  const nextOccurrences = expandOccurrences(rule, [], nextMonthStart, monthAfterNextStart);
  if (nextOccurrences.length > 0) {
    const original = nextOccurrences[0].occurrenceStart;
    const wall = toWallClockDate(original, timezone);
    const occId = await materializeOccurrence(tx, series.id, original);
    await tx
      .updateTable('event_occurrences')
      .set({
        override_start: at(
          timezone,
          wall.getUTCFullYear(),
          wall.getUTCMonth(),
          wall.getUTCDate() + 1,
          19,
          0,
        ),
        override_end: at(
          timezone,
          wall.getUTCFullYear(),
          wall.getUTCMonth(),
          wall.getUTCDate() + 1,
          20,
          30,
        ),
        updated_at: new Date(),
      })
      .where('id', '=', occId)
      .execute();
  }

  await addComment(
    tx,
    series.id,
    null,
    users.commenter.id,
    'The agenda is posted on the notice board the day before the meeting.',
  );
}

async function seedOperations(tx: Tx): Promise<void> {
  for (const seed of OPERATION_SEEDS) {
    const operation = await tx
      .insertInto('operations')
      .values({
        name: seed.name,
        description: seed.description,
        requirements: seed.requirements,
        location: seed.location,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    for (const assignment of seed.assignments) {
      await tx
        .insertInto('op_assignments')
        .values({
          operation_id: operation.id,
          name: assignment.name,
          description: assignment.description,
        })
        .execute();
    }
  }
}

/**
 * Seeds semi-realistic test data inside the given transaction. Exported so
 * the test suite can run it against PGlite and assert the resulting row
 * counts. The caller must ensure exactly one user and one organization exist.
 */
export async function seedTestData(tx: Tx): Promise<void> {
  const realUser = await tx.selectFrom('users').selectAll().executeTakeFirstOrThrow();
  const firstOrganization = await tx
    .selectFrom('organizations')
    .selectAll()
    .executeTakeFirstOrThrow();
  const permissionIds = await loadPermissionIds(tx);

  // A second organization, so multi-organization behavior can be tested.
  // The first user becomes its admin.
  const secondOrganization = await tx
    .insertInto('organizations')
    .values({
      name: 'Riverside Community Association',
      description: 'A second organization for testing multi-organization setups.',
      default_timezone: 'Europe/Helsinki',
    })
    .returningAll()
    .executeTakeFirstOrThrow();
  await tx
    .insertInto('user_organizations')
    .values({ user_id: realUser.id, organization_id: secondOrganization.id })
    .execute();
  logger.info(`Created organization "${secondOrganization.name}"`);

  const coordinatorPermissions = permissionIdList(permissionIds, [
    PERMISSIONS.EVENTS_READ,
    PERMISSIONS.EVENTS_WRITE,
    PERMISSIONS.OPERATIONS_READ,
    PERMISSIONS.ORGANIZATION_WRITE,
  ]);
  const memberPermissions = permissionIdList(permissionIds, [PERMISSIONS.EVENTS_READ]);

  // --- First organization (created by the first login) ---
  // Its Admin role and Default Calendar are created by the first login;
  // create them if missing so the script also works on a database where
  // only the user and organization rows exist.
  if (!(await findRole(tx, firstOrganization.id, 'Admin'))) {
    await createRole(
      tx,
      firstOrganization.id,
      'Admin',
      'Full administrative access.',
      permissionIdList(permissionIds, [PERMISSIONS.ADMIN]),
    );
  }
  const coordinatorRoleOne = await createRole(
    tx,
    firstOrganization.id,
    'Event Coordinator',
    'Organizes events and operations.',
    coordinatorPermissions,
  );
  const memberRoleOne = await createRole(
    tx,
    firstOrganization.id,
    'Member',
    'A regular member of the organization.',
    memberPermissions,
  );

  const mockUsersOne = await createMockUsers(tx, MOCK_USERS_ORG_ONE);
  for (const user of mockUsersOne) {
    await tx
      .insertInto('user_organizations')
      .values({ user_id: user.id, organization_id: firstOrganization.id })
      .execute();
  }
  logger.info(
    `Seeded ${mockUsersOne.length} mock users for "${firstOrganization.name}" (no logins attached)`,
  );

  const teamsOne = await createTeams(tx, firstOrganization.id, [
    { name: 'Setup Crew', description: 'Sets up and cleans up event spaces.' },
    { name: 'Logistics', description: 'Handles deliveries, equipment and transport.' },
    { name: 'Community Kitchen', description: 'Cooks and serves the community lunch.' },
  ]);

  // Team members: assign mock users (and the real user) to teams.
  await addTeamMembers(tx, teamsOne[0].id, [mockUsersOne[0].id, mockUsersOne[6].id, realUser.id]);
  await addTeamMembers(tx, teamsOne[1].id, [mockUsersOne[1].id, mockUsersOne[4].id]);
  await addTeamMembers(tx, teamsOne[2].id, [mockUsersOne[2].id, mockUsersOne[7].id]);

  // Sites and rooms for the first organization.
  const { sites: sitesOne, rooms: roomsOne } = await createSites(tx, firstOrganization.id, [
    {
      name: 'Downtown Community Center',
      description: 'The main community center in the city center.',
      address: '123 Main Street, Downtown',
      rooms: [
        { name: 'Main Hall', description: 'The main hall with stage and seating for 200.' },
        { name: 'Community Kitchen', description: 'Shared kitchen for events.' },
        { name: 'Meeting Room A', description: 'Small meeting room for up to 20 people.' },
      ],
    },
    {
      name: 'Central Park',
      description: 'Outdoor park area with a stage and open green space.',
      address: 'Park Avenue, City Center',
      rooms: [
        { name: 'Stage Area', description: 'Covered stage for outdoor performances.' },
        { name: 'Picnic Area', description: 'Open grass area for gatherings.' },
      ],
    },
    {
      name: 'Sports Grounds',
      description: 'Sports fields and courts for outdoor activities.',
      address: null,
      rooms: [
        { name: 'Main Field', description: 'Grass field for football and other sports.' },
        { name: 'Tennis Court', description: 'Hard surface tennis court.' },
      ],
    },
  ]);

  // Work roles and certifications for the first organization.
  const workRolesOne = await createWorkRoles(tx, firstOrganization.id, [
    {
      name: 'Setup',
      description: 'Set up furniture, equipment and decorations before events.',
    },
    { name: 'Cleanup', description: 'Clean up and pack away after events.' },
    {
      name: 'Kitchen Helper',
      description: 'Help prepare and serve food in the community kitchen.',
    },
    { name: 'AV Technician', description: 'Operate audio and video equipment during events.' },
  ]);
  const certsOne = await createCertifications(tx, firstOrganization.id, [
    { name: 'First Aid Certificate', description: 'Valid first aid certification.' },
    { name: 'Food Hygiene Certificate', description: 'Required for handling food.' },
    {
      name: 'Sound Engineering Certificate',
      description: 'Certified to operate the mixing desk.',
    },
  ]);
  // AV Technician requires Sound Engineering Certificate.
  await linkCertificationToWorkRole(tx, workRolesOne[3].id, certsOne[2].id);
  // Kitchen Helper requires Food Hygiene Certificate.
  await linkCertificationToWorkRole(tx, workRolesOne[2].id, certsOne[1].id);

  // Assign mock users to work roles matching their descriptions.
  // mockUsersOne[0] = Anna Korhonen (coordinator, employed) - Setup, qualified
  await assignUserToWorkRole(tx, mockUsersOne[0].id, workRolesOne[0].id, true);
  // mockUsersOne[1] = Mikko Virtanen (logistics, employed) - Setup, Cleanup, qualified
  await assignUserToWorkRole(tx, mockUsersOne[1].id, workRolesOne[0].id, true);
  await assignUserToWorkRole(tx, mockUsersOne[1].id, workRolesOne[1].id, true);
  // mockUsersOne[2] = Liisa Makinen (kitchen) - Kitchen Helper, qualified, has Food Hygiene cert
  await assignUserToWorkRole(tx, mockUsersOne[2].id, workRolesOne[2].id, true);
  await assignUserCertification(
    tx,
    mockUsersOne[2].id,
    certsOne[1].id,
    new Date(now.getUTCFullYear() - 1, 5, 15),
    new Date(now.getUTCFullYear() + 2, 5, 15),
  );
  // mockUsersOne[3] = Jukka Nieminen (sports grounds) - Setup, not yet qualified
  await assignUserToWorkRole(tx, mockUsersOne[3].id, workRolesOne[0].id, false);
  // mockUsersOne[5] = Ville Lehtonen (helps out) - Cleanup, not qualified
  await assignUserToWorkRole(tx, mockUsersOne[5].id, workRolesOne[1].id, false);
  // mockUsersOne[6] = Emilia Jarvinen - Kitchen Helper, not qualified
  await assignUserToWorkRole(tx, mockUsersOne[6].id, workRolesOne[2].id, false);
  // realUser - AV Technician, qualified, has Sound Engineering cert
  await assignUserToWorkRole(tx, realUser.id, workRolesOne[3].id, true);
  await assignUserCertification(
    tx,
    realUser.id,
    certsOne[2].id,
    new Date(now.getUTCFullYear() - 2, 2, 10),
    new Date(now.getUTCFullYear() + 1, 2, 10),
  );
  // mockUsersOne[2] also has First Aid
  await assignUserCertification(
    tx,
    mockUsersOne[2].id,
    certsOne[0].id,
    new Date(now.getUTCFullYear() - 1, 0, 20),
    new Date(now.getUTCFullYear() + 2, 0, 20),
  );

  let defaultCalendarOne = await tx
    .selectFrom('calendars')
    .selectAll()
    .where('organization_id', '=', firstOrganization.id)
    .orderBy('created_at', 'asc')
    .executeTakeFirst();
  if (!defaultCalendarOne) {
    defaultCalendarOne = await createCalendar(tx, firstOrganization.id, 'Default Calendar');
  }
  const communityHallCalendar = await createCalendar(tx, firstOrganization.id, 'Community Hall');

  const weeklyMeetingTypeOne = await createEventType(tx, defaultCalendarOne.id, {
    name: 'Weekly Meeting',
    description: 'A recurring weekly meeting.',
    recurrence: 'RRULE:FREQ=WEEKLY',
  });
  await createEventType(tx, defaultCalendarOne.id, {
    name: 'One-off Event',
    description: 'A single, non-repeating event.',
    recurrence: null,
  });
  const cleanupTypeOne = await createEventType(tx, communityHallCalendar.id, {
    name: 'Cleanup Day',
    description: 'A community cleanup day.',
    recurrence: null,
  });
  await createEventType(tx, communityHallCalendar.id, {
    name: 'Workshop',
    description: 'A hands-on workshop.',
    recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=WE',
  });

  // Role assignments, including ones scoped to a team or an event type.
  await assignRole(tx, mockUsersOne[0].id, coordinatorRoleOne.id);
  await assignRole(tx, mockUsersOne[1].id, coordinatorRoleOne.id, teamsOne[0].id);
  await assignRole(tx, mockUsersOne[2].id, memberRoleOne.id, null, cleanupTypeOne.id);
  for (const user of mockUsersOne.slice(3)) {
    await assignRole(tx, user.id, memberRoleOne.id);
  }

  await tx
    .insertInto('event_type_roles')
    .values({
      event_type_id: cleanupTypeOne.id,
      team_id: teamsOne[0].id,
      name: 'Setup crew',
      description: 'Responsible for setting up before cleanup days.',
    })
    .execute();
  await tx
    .insertInto('event_type_roles')
    .values({
      event_type_id: weeklyMeetingTypeOne.id,
      role_id: coordinatorRoleOne.id,
      name: 'Meeting coordinator',
      description: 'Prepares the agenda and chairs the meeting.',
    })
    .execute();

  // --- Event series for the first organization (timezone: UTC) ---

  // A past all-day event in the previous month, fully staffed.
  const cleanupDay = await createSeries(tx, {
    title: 'Spring Cleanup Day',
    description: 'Community cleanup of the hall and the yard. Gloves and bags are provided.',
    calendar_id: communityHallCalendar.id,
    start: at('UTC', prevYear, prevMonth, 10, 0, 0),
    duration_minutes: 1440,
    is_all_day: true,
    timezone: 'UTC',
  });
  const cleanupSetupJob = await addJob(
    tx,
    cleanupDay.id,
    null,
    'Set up tables and signs',
    'Put up tables, chairs and signs before the cleanup starts.',
    true,
    workRolesOne[0].id,
  );
  await assignUser(tx, cleanupSetupJob.id, mockUsersOne[0].id);
  const cleanupJob = await addJob(
    tx,
    cleanupDay.id,
    null,
    'Clean the hall',
    'Sweep and mop the hall after the cleanup.',
    true,
    workRolesOne[1].id,
  );
  await assignUser(tx, cleanupJob.id, mockUsersOne[1].id);
  await assignUser(tx, cleanupJob.id, mockUsersOne[6].id);
  await addComment(
    tx,
    cleanupDay.id,
    null,
    realUser.id,
    'Last year 30 volunteers showed up. Let us beat that!',
  );

  // Work role slots on the parent series (inherited by occurrences on
  // materialization): Setup (critical), Cleanup (critical, 2 slots).
  await addJob(
    tx,
    cleanupDay.id,
    null,
    'Setup',
    'Set up before the cleanup.',
    true,
    workRolesOne[0].id,
  );
  await addJob(tx, cleanupDay.id, null, 'Cleanup', 'Clean the hall.', true, workRolesOne[1].id);
  await addJob(tx, cleanupDay.id, null, 'Cleanup', 'Clean the yard.', true, workRolesOne[1].id);

  // A weekly recurring meeting spanning all three months, with a
  // cancelled occurrence in the current month and a rescheduled
  // occurrence in the next month.
  await seedWeeklyMeeting(tx, 'Weekly Community Meeting', defaultCalendarOne.id, 'UTC', {
    setup: mockUsersOne[0],
    coffee: mockUsersOne[2],
    av: mockUsersOne[6],
    commenter: mockUsersOne[1],
    occurrenceCommenter: realUser,
  });

  // A daily weekday series (BYDAY as a filter) in the mornings.
  const standupStartWall = firstWeekdayOfMonth(prevYear, prevMonth, 1);
  const standupStart = at(
    'UTC',
    standupStartWall.getUTCFullYear(),
    standupStartWall.getUTCMonth(),
    standupStartWall.getUTCDate(),
    9,
    0,
  );
  await createSeries(tx, {
    title: 'Weekday Standup',
    description: 'Short daily standup for the active volunteers.',
    calendar_id: defaultCalendarOne.id,
    start: standupStart,
    duration_minutes: 15,
    rrule: buildRruleString(
      { start: standupStart, timezone: 'UTC' },
      { freq: 'DAILY', byWeekdays: [1, 2, 3, 4, 5] },
    ),
    timezone: 'UTC',
  });

  // A monthly recurring meeting.
  const generalMeetingStart = at('UTC', prevYear, prevMonth, 15, 19, 0);
  const generalMeeting = await createSeries(tx, {
    title: 'Monthly General Meeting',
    description: 'Monthly meeting of the community. All members are welcome.',
    calendar_id: defaultCalendarOne.id,
    start: generalMeetingStart,
    duration_minutes: 120,
    rrule: buildRruleString({ start: generalMeetingStart, timezone: 'UTC' }, { freq: 'MONTHLY' }),
    timezone: 'UTC',
  });
  const chairJob = await addJob(
    tx,
    generalMeeting.id,
    null,
    'Chair the meeting',
    'Prepare the agenda and chair the meeting.',
  );
  await assignUser(tx, chairJob.id, mockUsersOne[0].id);
  await addComment(
    tx,
    generalMeeting.id,
    null,
    mockUsersOne[3].id,
    'The annual report will be presented at this meeting.',
  );

  // A one-off event in the current month, with an unassigned job slot.
  const festivalPlanning = await createSeries(tx, {
    title: 'Summer Festival Planning',
    description: "Planning meeting for this year's summer festival.",
    calendar_id: communityHallCalendar.id,
    start: at('UTC', thisYear, thisMonth, 20, 18, 0),
    duration_minutes: 120,
    timezone: 'UTC',
  });
  const stageJob = await addJob(
    tx,
    festivalPlanning.id,
    null,
    'Book the stage',
    'Find and book a stage for the festival.',
  );
  await assignUser(tx, stageJob.id, mockUsersOne[1].id);
  await addJob(
    tx,
    festivalPlanning.id,
    null,
    'Invite food trucks',
    'Collect applications from food trucks. Currently unassigned.',
  );
  await addComment(
    tx,
    festivalPlanning.id,
    null,
    mockUsersOne[0].id,
    "Bring your ideas for this year's program.",
  );

  // A one-off event in the next month.
  const kickoff = await createSeries(tx, {
    title: 'New Season Kickoff',
    description: 'Kickoff event for the new season. Open to everyone.',
    calendar_id: defaultCalendarOne.id,
    start: at('UTC', nextYear, nextMonth, 15, 17, 0),
    duration_minutes: 180,
    timezone: 'UTC',
  });
  const venueJob = await addJob(
    tx,
    kickoff.id,
    null,
    'Book the venue',
    'Reserve the hall for the kickoff event.',
  );
  await assignUser(tx, venueJob.id, mockUsersOne[2].id);
  await addJob(
    tx,
    kickoff.id,
    null,
    'Plan the program',
    'Collect ideas for the kickoff program. Currently unassigned.',
  );

  // A hidden series, to test visibility filtering.
  await createSeries(tx, {
    title: 'Board Meeting',
    description: 'Internal board meeting. Not shown on public calendars.',
    calendar_id: defaultCalendarOne.id,
    start: at('UTC', thisYear, thisMonth, 25, 10, 0),
    duration_minutes: 60,
    is_visible: false,
    timezone: 'UTC',
  });

  // A one-off event in a timezone different from the organization default.
  const webinar = await createSeries(tx, {
    title: 'International Webinar',
    description: 'Online webinar with partner organizations abroad.',
    calendar_id: defaultCalendarOne.id,
    start: at('Europe/Helsinki', nextYear, nextMonth, 8, 19, 0),
    duration_minutes: 60,
    timezone: 'Europe/Helsinki',
  });
  const webinarJob = await addJob(
    tx,
    webinar.id,
    null,
    'Host the webinar',
    'Start the stream and moderate the chat.',
  );
  await assignUser(tx, webinarJob.id, realUser.id);

  // Set site/room assignments and assign teams to event series.
  // cleanupDay: Downtown Community Center, Main Hall
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesOne[0].id, room_id: roomsOne[0].id })
    .where('id', '=', cleanupDay.id)
    .execute();
  // generalMeeting: Downtown Community Center, Meeting Room A
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesOne[0].id, room_id: roomsOne[2].id })
    .where('id', '=', generalMeeting.id)
    .execute();
  // festivalPlanning: Central Park (whole site reserved, no specific room)
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesOne[1].id, reserve_whole_site: true })
    .where('id', '=', festivalPlanning.id)
    .execute();
  // kickoff: Sports Grounds, Main Field
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesOne[2].id, room_id: roomsOne[3].id })
    .where('id', '=', kickoff.id)
    .execute();
  await assignTeamsToSeries(tx, cleanupDay.id, [teamsOne[0].id]);
  await assignTeamsToSeries(tx, festivalPlanning.id, [teamsOne[1].id]);
  await assignTeamsToSeries(tx, kickoff.id, [teamsOne[0].id, teamsOne[1].id]);

  // Notifications for the first organization's users.
  await addNotification(
    tx,
    realUser.id,
    firstOrganization.id,
    'Welcome to Watodo',
    'Your organization has been set up. Explore the calendar and invite your team.',
    false,
  );
  await addNotification(
    tx,
    realUser.id,
    firstOrganization.id,
    'Upcoming event',
    'Summer Festival Planning is happening this month. Check the calendar for details.',
    false,
  );
  await addNotification(
    tx,
    mockUsersOne[0].id,
    firstOrganization.id,
    'You have been assigned a job',
    'You are assigned to "Room setup" for the Weekly Community Meeting.',
    true,
  );
  await addNotification(
    tx,
    mockUsersOne[2].id,
    firstOrganization.id,
    'New event comment',
    'Someone commented on the Weekly Community Meeting.',
    false,
  );

  logger.info(`Seeded event series for "${firstOrganization.name}"`);

  // --- Second organization ---
  const adminRoleTwo = await createRole(
    tx,
    secondOrganization.id,
    'Admin',
    'Full administrative access.',
    permissionIdList(permissionIds, [PERMISSIONS.ADMIN]),
  );
  const coordinatorRoleTwo = await createRole(
    tx,
    secondOrganization.id,
    'Event Coordinator',
    'Organizes events and operations.',
    coordinatorPermissions,
  );
  const memberRoleTwo = await createRole(
    tx,
    secondOrganization.id,
    'Member',
    'A regular member of the organization.',
    memberPermissions,
  );

  const mockUsersTwo = await createMockUsers(tx, MOCK_USERS_ORG_TWO);
  for (const user of mockUsersTwo) {
    await tx
      .insertInto('user_organizations')
      .values({ user_id: user.id, organization_id: secondOrganization.id })
      .execute();
  }
  logger.info(
    `Seeded ${mockUsersTwo.length} mock users for "${secondOrganization.name}" (no logins attached)`,
  );

  const teamsTwo = await createTeams(tx, secondOrganization.id, [
    { name: 'Events Team', description: 'Plans and runs the association events.' },
    { name: 'Sports Crew', description: 'Coaches and trains the sports teams.' },
  ]);

  // Team members for the second organization.
  await addTeamMembers(tx, teamsTwo[0].id, [mockUsersTwo[0].id, mockUsersTwo[2].id, realUser.id]);
  await addTeamMembers(tx, teamsTwo[1].id, [
    mockUsersTwo[1].id,
    mockUsersTwo[3].id,
    mockUsersTwo[5].id,
  ]);

  // Sites and rooms for the second organization.
  const { sites: sitesTwo, rooms: roomsTwo } = await createSites(tx, secondOrganization.id, [
    {
      name: 'Riverside Association Hall',
      description: 'The main hall of the riverside community association.',
      address: '45 River Road, Riverside',
      rooms: [
        { name: 'Main Hall', description: 'Large hall for meetings and events.' },
        { name: 'Kitchen', description: 'Small kitchen for coffee and snacks.' },
      ],
    },
    {
      name: 'Riverside Beach',
      description: 'Beach area along the river, great for outdoor gatherings.',
      address: null,
      rooms: [{ name: 'Beach Front', description: 'Sandy area along the water.' }],
    },
    {
      name: 'Sports Field',
      description: 'Outdoor sports field with changing rooms.',
      address: '78 Sports Lane, Riverside',
      rooms: [
        { name: 'Football Field', description: 'Grass field for football.' },
        { name: 'Running Track', description: '400m running track.' },
      ],
    },
  ]);

  // Work roles and certifications for the second organization.
  const workRolesTwo = await createWorkRoles(tx, secondOrganization.id, [
    { name: 'Event Setup', description: 'Set up chairs, tables and equipment before events.' },
    { name: 'Coaching', description: 'Coach and supervise sports activities.' },
    { name: 'Kitchen Duty', description: 'Prepare and serve food at community events.' },
  ]);
  const certsTwo = await createCertifications(tx, secondOrganization.id, [
    { name: 'First Aid Certificate', description: 'Valid first aid certification.' },
    { name: 'Food Hygiene Certificate', description: 'Required for handling food.' },
    { name: 'Coaching License', description: 'Certified sports coaching license.' },
  ]);
  // Coaching requires Coaching License.
  await linkCertificationToWorkRole(tx, workRolesTwo[1].id, certsTwo[2].id);
  // Kitchen Duty requires Food Hygiene Certificate.
  await linkCertificationToWorkRole(tx, workRolesTwo[2].id, certsTwo[1].id);

  // Assign mock users to work roles for the second organization.
  // mockUsersTwo[0] - Event Setup, qualified
  await assignUserToWorkRole(tx, mockUsersTwo[0].id, workRolesTwo[0].id, true);
  // mockUsersTwo[1] - Coaching, qualified, has Coaching License
  await assignUserToWorkRole(tx, mockUsersTwo[1].id, workRolesTwo[1].id, true);
  await assignUserCertification(
    tx,
    mockUsersTwo[1].id,
    certsTwo[2].id,
    new Date(now.getUTCFullYear() - 1, 8, 1),
    new Date(now.getUTCFullYear() + 2, 8, 1),
  );
  // mockUsersTwo[2] - Kitchen Duty, not qualified
  await assignUserToWorkRole(tx, mockUsersTwo[2].id, workRolesTwo[2].id, false);
  // mockUsersTwo[3] - Coaching, not qualified
  await assignUserToWorkRole(tx, mockUsersTwo[3].id, workRolesTwo[1].id, false);
  // mockUsersTwo[5] - Event Setup, qualified
  await assignUserToWorkRole(tx, mockUsersTwo[5].id, workRolesTwo[0].id, true);
  // mockUsersTwo[0] also has First Aid
  await assignUserCertification(
    tx,
    mockUsersTwo[0].id,
    certsTwo[0].id,
    new Date(now.getUTCFullYear() - 2, 3, 15),
    new Date(now.getUTCFullYear() + 1, 3, 15),
  );
  // realUser - Kitchen Duty, qualified, has Food Hygiene cert
  await assignUserToWorkRole(tx, realUser.id, workRolesTwo[2].id, true);
  await assignUserCertification(
    tx,
    realUser.id,
    certsTwo[1].id,
    new Date(now.getUTCFullYear() - 1, 6, 10),
    new Date(now.getUTCFullYear() + 2, 6, 10),
  );

  const mainCalendar = await createCalendar(tx, secondOrganization.id, 'Main Calendar');
  const sportsCalendar = await createCalendar(tx, secondOrganization.id, 'Sports Grounds');

  const weeklyMeetingTypeTwo = await createEventType(tx, mainCalendar.id, {
    name: 'Weekly Meeting',
    description: 'A recurring weekly meeting.',
    recurrence: 'RRULE:FREQ=WEEKLY',
  });
  await createEventType(tx, mainCalendar.id, {
    name: 'One-off Event',
    description: 'A single, non-repeating event.',
    recurrence: null,
  });
  const sportsPracticeType = await createEventType(tx, sportsCalendar.id, {
    name: 'Sports Practice',
    description: 'A recurring sports practice.',
    recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH',
  });
  await createEventType(tx, sportsCalendar.id, {
    name: 'Tournament',
    description: 'A one-off tournament.',
    recurrence: null,
  });

  // Role assignments, including ones scoped to a team or an event type.
  await assignRole(tx, realUser.id, adminRoleTwo.id);
  await assignRole(tx, mockUsersTwo[0].id, coordinatorRoleTwo.id);
  await assignRole(tx, mockUsersTwo[1].id, coordinatorRoleTwo.id, teamsTwo[1].id);
  await assignRole(tx, mockUsersTwo[2].id, memberRoleTwo.id, null, sportsPracticeType.id);
  for (const user of mockUsersTwo.slice(3)) {
    await assignRole(tx, user.id, memberRoleTwo.id);
  }

  await tx
    .insertInto('event_type_roles')
    .values({
      event_type_id: sportsPracticeType.id,
      team_id: teamsTwo[1].id,
      name: 'Practice coach',
      description: 'Plans and leads the practice sessions.',
    })
    .execute();
  await tx
    .insertInto('event_type_roles')
    .values({
      event_type_id: weeklyMeetingTypeTwo.id,
      role_id: coordinatorRoleTwo.id,
      name: 'Meeting coordinator',
      description: 'Prepares the agenda and chairs the meeting.',
    })
    .execute();

  // --- Event series for the second organization (timezone: Europe/Helsinki) ---

  // A past all-day event in the previous month, fully staffed.
  const beachCleanup = await createSeries(tx, {
    title: 'Beach Cleanup Day',
    description: 'Community cleanup of the beach. Gloves and bags are provided.',
    calendar_id: sportsCalendar.id,
    start: at('Europe/Helsinki', prevYear, prevMonth, 12, 0, 0),
    duration_minutes: 1440,
    is_all_day: true,
    timezone: 'Europe/Helsinki',
  });
  const glovesJob = await addJob(
    tx,
    beachCleanup.id,
    null,
    'Hand out gloves and bags',
    'Welcome the volunteers and hand out equipment.',
  );
  await assignUser(tx, glovesJob.id, mockUsersTwo[0].id);
  const vanJob = await addJob(
    tx,
    beachCleanup.id,
    null,
    'Drive the van',
    'Drive the collected waste to the recycling center.',
  );
  await assignUser(tx, vanJob.id, mockUsersTwo[1].id);
  await assignUser(tx, vanJob.id, mockUsersTwo[5].id);
  await addComment(
    tx,
    beachCleanup.id,
    null,
    realUser.id,
    'Bring a friend and dress for the weather!',
  );

  // A weekly recurring meeting spanning all three months.
  await seedWeeklyMeeting(tx, 'Weekly Association Meeting', mainCalendar.id, 'Europe/Helsinki', {
    setup: mockUsersTwo[0],
    coffee: mockUsersTwo[2],
    av: mockUsersTwo[3],
    commenter: mockUsersTwo[1],
    occurrenceCommenter: mockUsersTwo[4],
  });

  // A daily weekday series in the mornings.
  const morningRunStartWall = firstWeekdayOfMonth(prevYear, prevMonth, 1);
  const morningRunStart = at(
    'Europe/Helsinki',
    morningRunStartWall.getUTCFullYear(),
    morningRunStartWall.getUTCMonth(),
    morningRunStartWall.getUTCDate(),
    7,
    0,
  );
  await createSeries(tx, {
    title: 'Morning Run',
    description: 'Easy-paced group run for all levels.',
    calendar_id: sportsCalendar.id,
    start: morningRunStart,
    duration_minutes: 45,
    rrule: buildRruleString(
      { start: morningRunStart, timezone: 'Europe/Helsinki' },
      { freq: 'DAILY', byWeekdays: [1, 2, 3, 4, 5] },
    ),
    timezone: 'Europe/Helsinki',
  });

  // A monthly recurring meeting.
  const boardMeetingStart = at('Europe/Helsinki', prevYear, prevMonth, 15, 19, 0);
  const boardMeeting = await createSeries(tx, {
    title: 'Monthly Board Meeting',
    description: 'Monthly meeting of the association board.',
    calendar_id: mainCalendar.id,
    start: boardMeetingStart,
    duration_minutes: 120,
    rrule: buildRruleString(
      { start: boardMeetingStart, timezone: 'Europe/Helsinki' },
      { freq: 'MONTHLY' },
    ),
    timezone: 'Europe/Helsinki',
  });
  const agendaJob = await addJob(
    tx,
    boardMeeting.id,
    null,
    'Prepare the agenda',
    'Collect agenda items and prepare the agenda.',
  );
  await assignUser(tx, agendaJob.id, mockUsersTwo[0].id);
  await addComment(
    tx,
    boardMeeting.id,
    null,
    mockUsersTwo[3].id,
    'Send your agenda items to Sofia by Friday.',
  );

  // A one-off event in the current month, with an unassigned job slot.
  const potluck = await createSeries(tx, {
    title: 'Community Potluck',
    description: 'Shared meal where everyone brings a dish.',
    calendar_id: mainCalendar.id,
    start: at('Europe/Helsinki', thisYear, thisMonth, 20, 18, 0),
    duration_minutes: 180,
    timezone: 'Europe/Helsinki',
  });
  const tablesJob = await addJob(
    tx,
    potluck.id,
    null,
    'Organize tables and chairs',
    'Set up tables and chairs for the potluck.',
  );
  await assignUser(tx, tablesJob.id, mockUsersTwo[4].id);
  await addJob(
    tx,
    potluck.id,
    null,
    'Dessert table',
    'Run the dessert table. Currently unassigned.',
  );
  await addComment(
    tx,
    potluck.id,
    null,
    mockUsersTwo[2].id,
    'Sign up for a dish on the notice board.',
  );

  // A one-off event in the next month.
  const seasonKickoff = await createSeries(tx, {
    title: 'Sports Season Kickoff',
    description: 'Kickoff event for the sports season.',
    calendar_id: sportsCalendar.id,
    start: at('Europe/Helsinki', nextYear, nextMonth, 15, 17, 0),
    duration_minutes: 120,
    timezone: 'Europe/Helsinki',
  });
  const fieldJob = await addJob(
    tx,
    seasonKickoff.id,
    null,
    'Book the field',
    'Reserve the sports field for the kickoff.',
  );
  await assignUser(tx, fieldJob.id, mockUsersTwo[3].id);
  await addJob(
    tx,
    seasonKickoff.id,
    null,
    'Order jerseys',
    'Collect sizes and order jerseys for the teams. Currently unassigned.',
  );

  // A hidden series, to test visibility filtering.
  await createSeries(tx, {
    title: 'Internal Finance Review',
    description: 'Internal review of the association finances.',
    calendar_id: mainCalendar.id,
    start: at('Europe/Helsinki', thisYear, thisMonth, 25, 9, 0),
    duration_minutes: 60,
    is_visible: false,
    timezone: 'Europe/Helsinki',
  });

  // A one-off event in a timezone different from the organization default.
  const streamedWorkshop = await createSeries(tx, {
    title: 'UTC Streamed Workshop',
    description: 'Workshop streamed in UTC for remote participants.',
    calendar_id: mainCalendar.id,
    start: at('UTC', nextYear, nextMonth, 8, 19, 0),
    duration_minutes: 90,
    timezone: 'UTC',
  });
  const moderatorJob = await addJob(
    tx,
    streamedWorkshop.id,
    null,
    'Moderate the stream',
    'Start the stream and moderate the chat.',
  );
  await assignUser(tx, moderatorJob.id, realUser.id);

  // Set site/room assignments and assign teams to event series for the
  // second org.
  // beachCleanup: Riverside Beach (whole site)
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesTwo[1].id, reserve_whole_site: true })
    .where('id', '=', beachCleanup.id)
    .execute();
  // boardMeeting: Riverside Association Hall, Main Hall
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesTwo[0].id, room_id: roomsTwo[0].id })
    .where('id', '=', boardMeeting.id)
    .execute();
  // potluck: Riverside Association Hall, Kitchen
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesTwo[0].id, room_id: roomsTwo[1].id })
    .where('id', '=', potluck.id)
    .execute();
  // seasonKickoff: Sports Field, Football Field
  await tx
    .updateTable('event_series')
    .set({ site_id: sitesTwo[2].id, room_id: roomsTwo[2].id })
    .where('id', '=', seasonKickoff.id)
    .execute();
  await assignTeamsToSeries(tx, beachCleanup.id, [teamsTwo[0].id]);
  await assignTeamsToSeries(tx, potluck.id, [teamsTwo[0].id]);
  await assignTeamsToSeries(tx, seasonKickoff.id, [teamsTwo[1].id]);

  // Notifications for the second organization's users.
  await addNotification(
    tx,
    realUser.id,
    secondOrganization.id,
    'New organization ready',
    'Riverside Community Association has been created. Start adding events.',
    false,
  );
  await addNotification(
    tx,
    mockUsersTwo[0].id,
    secondOrganization.id,
    'You are now an event coordinator',
    'You have been assigned the Event Coordinator role.',
    true,
  );
  await addNotification(
    tx,
    mockUsersTwo[4].id,
    secondOrganization.id,
    'Upcoming event',
    'Community Potluck is happening this month. Sign up for a dish.',
    false,
  );

  logger.info(`Seeded event series for "${secondOrganization.name}"`);

  // --- Operations (not organization-scoped) ---
  await seedOperations(tx);
  logger.info(`Seeded ${OPERATION_SEEDS.length} operations with assignments`);

  logger.info('Test data seeded successfully:');
  for (const table of SUMMARY_TABLES) {
    logger.info(`  ${table}: ${await countRows(tx, table)}`);
  }
  logger.info(`Log in as the first user (${realUser.email}) to explore the data.`);
}

async function main(): Promise<void> {
  await seedPermissions();

  const userCount = await countRows(db, 'users');
  const organizationCount = await countRows(db, 'organizations');
  if (userCount !== 1 || organizationCount !== 1) {
    logger.error(
      `Expected exactly 1 user and 1 organization (created by the first login), found ${userCount} user(s) and ${organizationCount} organization(s).`,
    );
    logger.error('This script only runs on a fresh database. Refusing to seed test data.');
    await disconnectDatabase();
    process.exit(1);
  }

  try {
    await db.transaction().execute(seedTestData);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(error => {
  logger.fatal({ error }, 'Failed to seed test data');
  process.exit(1);
});
