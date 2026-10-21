// Generates semi-realistic test data into the DATABASE_URL database for
// development and manual testing. Run from backend/ with `npm run seed:data`.
//
// The script only runs on a fresh database: it refuses to seed unless there is
// exactly one user and one organization, because those are created by the
// first login (see handleNewLogin in src/services/auth-service.ts). It then
// creates a second organization and fills both organizations with mock users
// (no login accounts attached), roles, teams, calendars, event types, event
// series across the previous, current and next month (with exceptions, job
// slots, assignments and comments), and a set of operations.
//
// When a feature that persists data is added, extend this script so the seed
// data keeps covering it (see AGENTS.md).

import type { Kysely, Transaction } from 'kysely';
import { db, disconnectDatabase } from '../src/database.js';
import type {
  Calendar,
  Database,
  EventJob,
  EventSeries,
  NewEventSeries,
  Role,
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
    description: 'Coordinates the weekly community meetings and keeps the calendar up to date.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Mikko Virtanen',
    email: 'mikko.virtanen@example.com',
    description: 'Handles logistics, deliveries and equipment.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Liisa Mäkinen',
    email: 'liisa.makinen@example.com',
    description: 'Runs the community kitchen and the weekly lunch.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Jukka Nieminen',
    email: 'jukka.nieminen@example.com',
    description: 'Takes care of the sports grounds and bookings.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Sanna Saarinen',
    email: 'sanna.saarinen@example.com',
    description: 'Organizes family and youth events.',
    isEmployed: false,
    isSuspended: true,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Ville Lehtonen',
    email: 'ville.lehtonen@example.com',
    description: 'Helps out at events when he has time.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'inactive',
  },
  {
    name: 'Emilia Järvinen',
    email: 'emilia.jarvinen@example.com',
    description: 'Likes to help with setup and cleaning.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Antti Hämäläinen',
    email: 'antti.hamalainen@example.com',
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
    description: 'Coordinates the association events and the calendar.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Erik Lindqvist',
    email: 'erik.lindqvist@example.com',
    description: 'Drives the van and handles equipment.',
    isEmployed: true,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Maria Johansson',
    email: 'maria.johansson@example.com',
    description: 'Runs the coffee and the weekly raffle.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Lars Bergström',
    email: 'lars.bergstrom@example.com',
    description: 'Coaches the junior football team.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Ingrid Nilsson',
    email: 'ingrid.nilsson@example.com',
    description: 'Organizes the seasonal cleanups.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Oscar Gustafsson',
    email: 'oscar.gustafsson@example.com',
    description: 'Takes photos at events.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'active',
  },
  {
    name: 'Elsa Holm',
    email: 'elsa.holm@example.com',
    description: 'Keeps the member list up to date.',
    isEmployed: false,
    isSuspended: false,
    isBlocked: false,
    state: 'inactive',
  },
  {
    name: 'Johan Söderberg',
    email: 'johan.soderberg@example.com',
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
  'calendars',
  'event_types',
  'event_type_roles',
  'event_series',
  'event_exceptions',
  'event_jobs',
  'event_job_assignments',
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

async function addJob(
  tx: Tx,
  seriesId: number,
  occurrenceStart: Date | null,
  title: string,
  description: string,
): Promise<EventJob> {
  return tx
    .insertInto('event_jobs')
    .values({ event_series_id: seriesId, occurrence_start: occurrenceStart, title, description })
    .returningAll()
    .executeTakeFirstOrThrow();
}

async function assignUser(tx: Tx, jobId: number, userId: string): Promise<void> {
  await tx
    .insertInto('event_job_assignments')
    .values({ event_job_id: jobId, user_id: userId })
    .execute();
}

async function addComment(
  tx: Tx,
  seriesId: number,
  occurrenceStart: Date | null,
  userId: string,
  body: string,
): Promise<void> {
  await tx
    .insertInto('event_comments')
    .values({
      event_series_id: seriesId,
      occurrence_start: occurrenceStart,
      user_id: userId,
      body,
    })
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
    await tx
      .insertInto('event_exceptions')
      .values({
        event_series_id: series.id,
        occurrence_start: currentOccurrences[1].occurrenceStart,
        is_cancelled: true,
      })
      .execute();
  }

  // Reschedule the first occurrence of the next month to the following day.
  const nextOccurrences = expandOccurrences(rule, [], nextMonthStart, monthAfterNextStart);
  if (nextOccurrences.length > 0) {
    const original = nextOccurrences[0].occurrenceStart;
    const wall = toWallClockDate(original, timezone);
    await tx
      .insertInto('event_exceptions')
      .values({
        event_series_id: series.id,
        occurrence_start: original,
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
      })
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
    await db.transaction().execute(async tx => {
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

      let defaultCalendarOne = await tx
        .selectFrom('calendars')
        .selectAll()
        .where('organization_id', '=', firstOrganization.id)
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
      if (!defaultCalendarOne) {
        defaultCalendarOne = await createCalendar(tx, firstOrganization.id, 'Default Calendar');
      }
      const communityHallCalendar = await createCalendar(
        tx,
        firstOrganization.id,
        'Community Hall',
      );

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
      );
      await assignUser(tx, cleanupSetupJob.id, mockUsersOne[0].id);
      const cleanupJob = await addJob(
        tx,
        cleanupDay.id,
        null,
        'Clean the hall',
        'Sweep and mop the hall after the cleanup.',
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
        rrule: buildRruleString(
          { start: generalMeetingStart, timezone: 'UTC' },
          { freq: 'MONTHLY' },
        ),
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
      await seedWeeklyMeeting(
        tx,
        'Weekly Association Meeting',
        mainCalendar.id,
        'Europe/Helsinki',
        {
          setup: mockUsersTwo[0],
          coffee: mockUsersTwo[2],
          av: mockUsersTwo[3],
          commenter: mockUsersTwo[1],
          occurrenceCommenter: mockUsersTwo[4],
        },
      );

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

      logger.info(`Seeded event series for "${secondOrganization.name}"`);

      // --- Operations (not organization-scoped) ---
      await seedOperations(tx);
      logger.info(`Seeded ${OPERATION_SEEDS.length} operations with assignments`);

      logger.info('Test data seeded successfully:');
      for (const table of SUMMARY_TABLES) {
        logger.info(`  ${table}: ${await countRows(tx, table)}`);
      }
      logger.info(`Log in as the first user (${realUser.email}) to explore the data.`);
    });
  } finally {
    await disconnectDatabase();
  }
}

main().catch(error => {
  logger.fatal({ error }, 'Failed to seed test data');
  process.exit(1);
});
