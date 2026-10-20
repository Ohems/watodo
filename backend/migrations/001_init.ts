import type { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  // Users
  pgm.createTable('users', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    email: { type: 'text', notNull: true, unique: true },
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

  // Initial permission set. New permissions are added here (or in a later
  // migration) together with new features, and registered in
  // backend/src/permissions.ts for use in code.
  pgm.sql(`INSERT INTO permissions (code, description) VALUES
    ('admin', 'Full administrative access. Bypasses all permission checks.'),
    ('user-management:read', 'View users.'),
    ('user-management:write', 'Create, update and delete users.'),
    ('role-management:read', 'View roles and role assignments.'),
    ('role-management:write', 'Create, update and delete roles, and assign them to users.'),
    ('operations:read', 'View operations.'),
    ('operations:write', 'Create, update and delete operations.')
    ON CONFLICT (code) DO NOTHING`);

  // Organizations
  pgm.createTable('organizations', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    name: { type: 'text', notNull: true },
    description: { type: 'text', notNull: true, default: '' },
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

  // Jobs (legacy)
  pgm.createTable('jobs', {
    id: { type: 'serial', primaryKey: true },
    title: { type: 'text', notNull: true },
  });

  // Event series (legacy)
  pgm.createTable('event_series', {
    id: { type: 'serial', primaryKey: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text' },
    rules: { type: 'jsonb', notNull: true },
    is_visible: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    calendar_id: { type: 'uuid', notNull: true, references: 'calendars', onDelete: 'CASCADE' },
  });

  // Events (legacy)
  pgm.createTable('events', {
    id: { type: 'serial', primaryKey: true },
    title: { type: 'text', notNull: true },
    description: { type: 'text' },
    assignee_id: { type: 'uuid', references: 'users', onDelete: 'SET NULL' },
    event_series_id: { type: 'integer', references: 'event_series', onDelete: 'SET NULL' },
    is_all_day: { type: 'boolean', notNull: true, default: false },
    start: { type: 'timestamptz', notNull: true },
    end: { type: 'timestamptz', notNull: true },
    is_visible: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Responsibilities (legacy)
  pgm.createTable('responsibilities', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    job_id: { type: 'integer', notNull: true, references: 'jobs', onDelete: 'CASCADE' },
  });
  pgm.addConstraint(
    'responsibilities',
    'responsibilities_user_job_unique',
    'UNIQUE(user_id, job_id)',
  );

  // Assignments (legacy)
  pgm.createTable('assignments', {
    id: { type: 'serial', primaryKey: true },
    user_id: { type: 'uuid', notNull: true, references: 'users', onDelete: 'CASCADE' },
    job_id: { type: 'integer', notNull: true, references: 'jobs', onDelete: 'CASCADE' },
    event_id: { type: 'integer', notNull: true, references: 'events', onDelete: 'CASCADE' },
  });
  pgm.addConstraint(
    'assignments',
    'assignments_user_job_event_unique',
    'UNIQUE(user_id, job_id, event_id)',
  );

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
  pgm.createIndex('events', 'start');
  pgm.createIndex('events', 'assignee_id');
  pgm.createIndex('operations', 'name');
  pgm.createIndex('op_assignments', 'operation_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('op_assignments');
  pgm.dropTable('operations');
  pgm.dropTable('assignments');
  pgm.dropTable('responsibilities');
  pgm.dropTable('events');
  pgm.dropTable('event_series');
  pgm.dropTable('jobs');
  pgm.dropTable('event_type_roles');
  pgm.dropTable('user_roles');
  pgm.dropTable('role_permissions');
  pgm.dropTable('roles');
  pgm.dropTable('event_types');
  pgm.dropTable('calendars');
  pgm.dropTable('teams');
  pgm.dropTable('user_organizations');
  pgm.dropTable('organizations');
  pgm.dropTable('permissions');
  pgm.dropTable('records');
  pgm.dropTable('access_tokens');
  pgm.dropTable('auth_accounts');
  pgm.dropTable('users');
}
