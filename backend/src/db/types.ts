import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type AuthProvider = 'discord' | 'google' | 'microsoft';

export interface Users {
  id: Generated<string>;
  email: string;
  name: string;
  is_employed: Generated<boolean>;
  is_suspended: Generated<boolean>;
  is_blocked: Generated<boolean>;
  description: Generated<string>;
  state: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuthAccounts {
  id: Generated<number>;
  user_id: string;
  provider: AuthProvider;
  provider_account_id: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_in: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccessTokens {
  id: Generated<number>;
  user_id: string;
  token: string;
  user_agent: Generated<string>;
  created_at: Generated<Date>;
}

export interface Records {
  id: Generated<number>;
  user_id: string;
  created_at: Generated<Date>;
  type: string;
  parameters: Record<string, unknown> | null;
}

export interface Permissions {
  id: Generated<number>;
  code: string;
  description: Generated<string>;
  created_at: Generated<Date>;
}

export interface Roles {
  id: Generated<number>;
  organization_id: string;
  name: string;
  description: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RolePermissions {
  id: Generated<number>;
  role_id: number;
  permission_id: number;
  created_at: Generated<Date>;
}

export interface UserRoles {
  id: Generated<number>;
  user_id: string;
  role_id: number;
  team_id: string | null;
  event_type_id: number | null;
  created_at: Generated<Date>;
}

export interface Organizations {
  id: Generated<string>;
  name: string;
  description: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserOrganizations {
  id: Generated<number>;
  user_id: string;
  organization_id: string;
  created_at: Generated<Date>;
}

export interface Teams {
  id: Generated<string>;
  name: string;
  description: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  organization_id: string;
}

export interface Calendars {
  id: Generated<string>;
  name: string;
  google_calendar_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  organization_id: string;
}

export interface EventTypes {
  id: Generated<number>;
  name: string;
  description: Generated<string>;
  recurrence: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  calendar_id: string;
}

export interface EventTypeRoles {
  id: Generated<number>;
  event_type_id: number;
  role_id: number | null;
  team_id: string | null;
  name: string;
  description: Generated<string>;
}

export interface Jobs {
  id: Generated<number>;
  title: string;
}

export interface EventSeries {
  id: Generated<number>;
  title: string;
  description: string | null;
  rules: Record<string, unknown>;
  is_visible: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  calendar_id: string;
}

export interface Events {
  id: Generated<number>;
  title: string;
  description: string | null;
  assignee_id: string | null;
  event_series_id: number | null;
  is_all_day: Generated<boolean>;
  start: Date;
  end: Date;
  is_visible: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Responsibilities {
  id: Generated<number>;
  user_id: string;
  job_id: number;
}

export interface Assignments {
  id: Generated<number>;
  user_id: string;
  job_id: number;
  event_id: number;
}

export interface Operations {
  id: Generated<number>;
  name: string;
  description: Generated<string>;
  requirements: Generated<string>;
  location: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OpAssignments {
  id: Generated<number>;
  operation_id: number;
  name: string;
  description: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Database {
  users: Users;
  auth_accounts: AuthAccounts;
  access_tokens: AccessTokens;
  records: Records;
  permissions: Permissions;
  roles: Roles;
  role_permissions: RolePermissions;
  user_roles: UserRoles;
  organizations: Organizations;
  user_organizations: UserOrganizations;
  teams: Teams;
  calendars: Calendars;
  event_types: EventTypes;
  event_type_roles: EventTypeRoles;
  jobs: Jobs;
  event_series: EventSeries;
  events: Events;
  responsibilities: Responsibilities;
  assignments: Assignments;
  operations: Operations;
  op_assignments: OpAssignments;
}

export type User = Selectable<Users>;
export type NewUser = Insertable<Users>;
export type UserUpdate = Updateable<Users>;

export type AuthAccount = Selectable<AuthAccounts>;
export type NewAuthAccount = Insertable<AuthAccounts>;
export type AuthAccountUpdate = Updateable<AuthAccounts>;

export type AccessToken = Selectable<AccessTokens>;
export type NewAccessToken = Insertable<AccessTokens>;

export type Permission = Selectable<Permissions>;
export type NewPermission = Insertable<Permissions>;

export type Role = Selectable<Roles>;
export type NewRole = Insertable<Roles>;
export type RoleUpdate = Updateable<Roles>;

export type RolePermission = Selectable<RolePermissions>;
export type NewRolePermission = Insertable<RolePermissions>;

export type UserRole = Selectable<UserRoles>;
export type NewUserRole = Insertable<UserRoles>;

export type Organization = Selectable<Organizations>;
export type NewOrganization = Insertable<Organizations>;

export type Operation = Selectable<Operations>;
export type NewOperation = Insertable<Operations>;
export type OperationUpdate = Updateable<Operations>;

export type OpAssignment = Selectable<OpAssignments>;
export type NewOpAssignment = Insertable<OpAssignments>;
export type OpAssignmentUpdate = Updateable<OpAssignments>;
