import type { MigrationBuilder } from 'node-pg-migrate';
// The .ts extension is required: node-pg-migrate loads migrations with a
// native import(), which does not map .js specifiers to .ts files.
import { PERMISSION_DEFINITIONS } from '../src/permissions.ts';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Users
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
    // Optional contact number in E.164 format (includes the country code).
    phone_number: { type: 'text' },
    name: { type: 'text', notNull: true },
    is_employed: { type: 'boolean', notNull: true, default: false },
    is_suspended: { type: 'boolean', notNull: true, default: false },
    is_blocked: { type: 'boolean', notNull: true, default: false },
    description: { type: 'text', notNull: true, default: '' },
    state: { type: 'text', notNull: true, default: 'active' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Authentication accounts (one user can have accounts from multiple providers)
  pgm.createTable('auth_accounts', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    provider: { type: 'text', notNull: true },
    provider_account_id: { type: 'text', notNull: true },
    access_token: { type: 'text' },
    refresh_token: { type: 'text' },
    expires_in: { type: 'integer' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'auth_accounts',
    'auth_accounts_provider_check',
    "CHECK (provider IN ('discord', 'google', 'microsoft'))",
  );
  pgm.addConstraint(
    'auth_accounts',
    'auth_accounts_provider_account_unique',
    'UNIQUE(provider, provider_account_id)',
  );
  pgm.createIndex('auth_accounts', 'user_id');

  // Access tokens
  pgm.createTable('access_tokens', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    token: { type: 'text', notNull: true, unique: true },
    user_agent: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Records
  pgm.createTable('records', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    type: { type: 'text', notNull: true },
    parameters: { type: 'jsonb' },
  });

  // Permissions (defined by the system; see backend/src/permissions.ts)
  pgm.createTable('permissions', {
    id: { type: 'serial', primaryKey: true },
    code: { type: 'text', notNull: true, unique: true },
    description: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Initial permission set, generated from the registry in
  // backend/src/permissions.ts so the migration and the `seed:permissions`
  // script always agree.
  const permissionValues = PERMISSION_DEFINITIONS.map(
    definition => `('${definition.code}', '${definition.description.replaceAll("'", "''")}')`,
  ).join(',\n    ');
  pgm.sql(`INSERT INTO permissions (code, description) VALUES
    ${permissionValues}
    ON CONFLICT (code) DO NOTHING`);

  // Organizations
  pgm.createTable('organizations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    // Default IANA timezone for the organization; new event series inherit it.
    default_timezone: { type: 'text', notNull: true, default: 'UTC' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // User organizations
  pgm.createTable('user_organizations', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'user_organizations',
    'user_organizations_user_org_unique',
    'UNIQUE(user_id, organization_id)',
  );

  // Teams
  pgm.createTable('teams', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
  });

  // Team members: users belonging to a team.
  pgm.createTable('team_members', {
    id: { type: 'serial', primaryKey: true },
    team_id: { type: 'uuid', notNull: true, references: 'teams', onDelete: 'CASCADE' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('team_members', 'team_members_team_user_unique', 'UNIQUE(team_id, user_id)');
  pgm.createIndex('team_members', 'user_id');

  // Locations (organization-scoped venues where events take place)
  pgm.createTable('locations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('locations', 'organization_id');

  // Jobs (organization-scoped job types, e.g. "Cook", "Driver")
  pgm.createTable('jobs', {
    id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('jobs', 'organization_id');

  // Notifications (per-user)
  pgm.createTable('notifications', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    title: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true, default: '' },
    is_read: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('notifications', 'user_id');

  // Calendars
  pgm.createTable('calendars', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    google_calendar_id: { type: 'text', unique: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
  });

  // Event types
  pgm.createTable('event_types', {
    id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    recurrence: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    calendar_id: { type: 'uuid', notNull: true, references: 'calendars', onDelete: 'CASCADE' },
  });

  // Roles (organization-specific)
  pgm.createTable('roles', {
    id: { type: 'serial', primaryKey: true },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('roles', 'organization_id');

  // Permissions granted to roles
  pgm.createTable('role_permissions', {
    id: { type: 'serial', primaryKey: true },
    role_id: { type: 'integer', notNull: true, references: 'roles', onDelete: 'CASCADE' },
    permission_id: {
      type: 'integer',
      notNull: true,
      references: 'permissions',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'role_permissions',
    'role_permissions_role_permission_unique',
    'UNIQUE(role_id, permission_id)',
  );
  pgm.createIndex('role_permissions', 'permission_id');

  // User roles (assignments can be scoped to a team and/or an event type)
  pgm.createTable('user_roles', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    role_id: { type: 'integer', notNull: true, references: 'roles', onDelete: 'CASCADE' },
    team_id: { type: 'uuid', references: 'teams', onDelete: 'CASCADE' },
    event_type_id: { type: 'integer', references: 'event_types', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'user_roles',
    'user_roles_user_role_scope_unique',
    'UNIQUE NULLS NOT DISTINCT (user_id, role_id, team_id, event_type_id)',
  );
  pgm.createIndex('user_roles', 'team_id');
  pgm.createIndex('user_roles', 'event_type_id');

  // Event type roles
  pgm.createTable('event_type_roles', {
    id: { type: 'serial', primaryKey: true },
    event_type_id: {
      type: 'integer',
      notNull: true,
      references: 'event_types',
      onDelete: 'CASCADE',
    },
    role_id: { type: 'integer', references: 'roles', onDelete: 'CASCADE' },
    team_id: { type: 'uuid', references: 'teams', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
  });

  // Event series: a single event or an rrule-based recurring series.
  //
  // `rrule` holds the canonical RRULE property (e.g. "RRULE:FREQ=WEEKLY;BYDAY=MO")
  // serialized by the rrule library. NULL means the series is a single,
  // non-repeating event. Occurrences are expanded on demand from `start`,
  // `duration_minutes`, `rrule` and `timezone`, so a series can repeat
  // arbitrarily far into the future (years, indefinitely) without
  // materializing one row per occurrence.
  pgm.createTable('event_series', {
    id: { type: 'serial', primaryKey: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text' },
    calendar_id: { type: 'uuid', notNull: true, references: 'calendars', onDelete: 'CASCADE' },
    location_id: { type: 'uuid', references: 'locations', onDelete: 'SET NULL' },
    start: { type: 'timestamptz', notNull: true },
    duration_minutes: { type: 'integer', notNull: true, default: 60 },
    is_all_day: { type: 'boolean', notNull: true, default: false },
    rrule: { type: 'text' },
    timezone: { type: 'text', notNull: true, default: 'UTC' },
    is_visible: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'event_series',
    'event_series_duration_positive',
    'CHECK (duration_minutes > 0)',
  );
  pgm.createIndex('event_series', 'calendar_id');
  pgm.createIndex('event_series', 'start');
  pgm.createIndex('event_series', 'location_id');

  // Event series to teams (many-to-many: teams assigned to an event series)
  pgm.createTable('event_series_teams', {
    id: { type: 'serial', primaryKey: true },
    event_series_id: {
      type: 'integer',
      notNull: true,
      references: 'event_series',
      onDelete: 'CASCADE',
    },
    team_id: { type: 'uuid', notNull: true, references: 'teams', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'event_series_teams',
    'event_series_teams_series_team_unique',
    'UNIQUE(event_series_id, team_id)',
  );
  pgm.createIndex('event_series_teams', 'team_id');

  // Event exceptions: per-occurrence overrides for a series (cancel an
  // occurrence, or reschedule it to a different time). `occurrence_start` is
  // the original occurrence start and acts as the occurrence's identity;
  // jobs and comments are keyed by it as well. A cancelled occurrence has
  // `is_cancelled` set; a rescheduled one has `override_start`/`override_end`.
  pgm.createTable('event_exceptions', {
    id: { type: 'serial', primaryKey: true },
    event_series_id: {
      type: 'integer',
      notNull: true,
      references: 'event_series',
      onDelete: 'CASCADE',
    },
    occurrence_start: { type: 'timestamptz', notNull: true },
    is_cancelled: { type: 'boolean', notNull: true, default: false },
    override_start: { type: 'timestamptz' },
    override_end: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'event_exceptions',
    'event_exceptions_series_occurrence_unique',
    'UNIQUE(event_series_id, occurrence_start)',
  );
  pgm.addConstraint(
    'event_exceptions',
    'event_exceptions_override_valid',
    'CHECK (override_end IS NULL OR override_start IS NULL OR override_end > override_start)',
  );
  pgm.createIndex('event_exceptions', 'event_series_id');

  // Event jobs: job slots that need to be staffed. `occurrence_start` NULL
  // means the slot applies to every occurrence of the series; a non-NULL
  // value scopes the slot to that single occurrence.
  pgm.createTable('event_jobs', {
    id: { type: 'serial', primaryKey: true },
    event_series_id: {
      type: 'integer',
      notNull: true,
      references: 'event_series',
      onDelete: 'CASCADE',
    },
    occurrence_start: { type: 'timestamptz' },
    title: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('event_jobs', ['event_series_id', 'occurrence_start']);

  // Event job assignments: users assigned to a job slot.
  pgm.createTable('event_job_assignments', {
    id: { type: 'serial', primaryKey: true },
    event_job_id: {
      type: 'integer',
      notNull: true,
      references: 'event_jobs',
      onDelete: 'CASCADE',
    },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'event_job_assignments',
    'event_job_assignments_job_user_unique',
    'UNIQUE(event_job_id, user_id)',
  );
  pgm.createIndex('event_job_assignments', 'user_id');

  // Event comments: comments on a whole series (`occurrence_start` NULL) or
  // on a single occurrence of it.
  pgm.createTable('event_comments', {
    id: { type: 'serial', primaryKey: true },
    event_series_id: {
      type: 'integer',
      notNull: true,
      references: 'event_series',
      onDelete: 'CASCADE',
    },
    occurrence_start: { type: 'timestamptz' },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    body: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('event_comments', ['event_series_id', 'occurrence_start']);

  // Operations
  pgm.createTable('operations', {
    id: { type: 'serial', primaryKey: true },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    requirements: { type: 'text', notNull: true, default: '' },
    location: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Operation assignments
  pgm.createTable('op_assignments', {
    id: { type: 'serial', primaryKey: true },
    operation_id: { type: 'integer', notNull: true, references: 'operations', onDelete: 'CASCADE' },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Indexes
  pgm.createIndex('users', 'state');
  pgm.createIndex('access_tokens', 'user_id');
  pgm.createIndex('operations', 'name');
  pgm.createIndex('op_assignments', 'operation_id');
  pgm.createIndex('teams', 'organization_id');
  pgm.createIndex('event_series', 'title');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('op_assignments');
  pgm.dropTable('operations');
  pgm.dropTable('event_comments');
  pgm.dropTable('event_job_assignments');
  pgm.dropTable('event_jobs');
  pgm.dropTable('event_exceptions');
  pgm.dropTable('event_series_teams');
  pgm.dropTable('event_series');
  pgm.dropTable('event_type_roles');
  pgm.dropTable('user_roles');
  pgm.dropTable('role_permissions');
  pgm.dropTable('roles');
  pgm.dropTable('event_types');
  pgm.dropTable('calendars');
  pgm.dropTable('notifications');
  pgm.dropTable('jobs');
  pgm.dropTable('locations');
  pgm.dropTable('team_members');
  pgm.dropTable('teams');
  pgm.dropTable('user_organizations');
  pgm.dropTable('organizations');
  pgm.dropTable('permissions');
  pgm.dropTable('records');
  pgm.dropTable('access_tokens');
  pgm.dropTable('auth_accounts');
  pgm.dropTable('users');
}
