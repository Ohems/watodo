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

  // Sites (organization-scoped physical locations: buildings, parks, etc.)
  pgm.createTable('sites', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    address: { type: 'text' },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('sites', 'organization_id');

  // Rooms (organization-scoped rooms within a site where events take place)
  pgm.createTable('rooms', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
    site_id: {
      type: 'uuid',
      notNull: true,
      references: 'sites',
      onDelete: 'CASCADE',
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('rooms', 'organization_id');
  pgm.createIndex('rooms', 'site_id');

  // Work roles (organization-scoped roles, e.g. "Cook", "AV Technician")
  pgm.createTable('work_roles', {
    id: { type: 'serial', primaryKey: true },
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
  pgm.createIndex('work_roles', 'organization_id');

  // Certifications (organization-scoped, e.g. "First Aid Certificate")
  pgm.createTable('certifications', {
    id: { type: 'serial', primaryKey: true },
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
  pgm.createIndex('certifications', 'organization_id');

  // User work roles: links users to work roles they are willing/qualified to fill.
  pgm.createTable('user_work_roles', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    work_role_id: {
      type: 'integer',
      notNull: true,
      references: 'work_roles',
      onDelete: 'CASCADE',
    },
    is_qualified: { type: 'boolean', notNull: true, default: false },
    notes: { type: 'text', notNull: true, default: '' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'user_work_roles',
    'user_work_roles_user_role_unique',
    'UNIQUE(user_id, work_role_id)',
  );
  pgm.createIndex('user_work_roles', 'user_id');
  pgm.createIndex('user_work_roles', 'work_role_id');

  // User certifications: links users to certifications they hold.
  pgm.createTable('user_certifications', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    certification_id: {
      type: 'integer',
      notNull: true,
      references: 'certifications',
      onDelete: 'CASCADE',
    },
    certification_date: { type: 'date' },
    valid_until_date: { type: 'date' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'user_certifications',
    'user_certifications_user_cert_unique',
    'UNIQUE(user_id, certification_id)',
  );
  pgm.createIndex('user_certifications', 'user_id');
  pgm.createIndex('user_certifications', 'certification_id');

  // Certification work roles: links certifications to work roles. A linked
  // certification is considered mandatory for that work role.
  pgm.createTable('certification_work_roles', {
    id: { type: 'serial', primaryKey: true },
    work_role_id: {
      type: 'integer',
      notNull: true,
      references: 'work_roles',
      onDelete: 'CASCADE',
    },
    certification_id: {
      type: 'integer',
      notNull: true,
      references: 'certifications',
      onDelete: 'CASCADE',
    },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'certification_work_roles',
    'certification_work_roles_role_cert_unique',
    'UNIQUE(work_role_id, certification_id)',
  );
  pgm.createIndex('certification_work_roles', 'work_role_id');
  pgm.createIndex('certification_work_roles', 'certification_id');

  // Notifications (per-user)
  pgm.createTable('notifications', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    // The organization this notification belongs to, if any (null for purely
    // personal notifications).
    organization_id: { type: 'uuid', references: 'organizations', onDelete: 'SET NULL' },
    title: { type: 'text', notNull: true },
    body: { type: 'text', notNull: true, default: '' },
    is_read: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('notifications', 'user_id');
  pgm.createIndex('notifications', 'organization_id');

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
    site_id: { type: 'uuid', references: 'sites', onDelete: 'SET NULL' },
    room_id: { type: 'uuid', references: 'rooms', onDelete: 'SET NULL' },
    reserve_whole_site: { type: 'boolean', notNull: true, default: false },
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
  pgm.createIndex('event_series', 'site_id');
  pgm.createIndex('event_series', 'room_id');

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
  pgm.dropTable('certification_work_roles');
  pgm.dropTable('user_certifications');
  pgm.dropTable('user_work_roles');
  pgm.dropTable('certifications');
  pgm.dropTable('work_roles');
  pgm.dropTable('rooms');
  pgm.dropTable('sites');
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
