import type { Generated, Insertable, Selectable, Updateable } from 'kysely';

export type AuthProvider = 'discord' | 'google' | 'microsoft';

export interface Users {
  id: Generated<string>;
  email: string;
  /** Optional contact number in E.164 format (includes the country code). */
  phone_number: Generated<string | null>;
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
  default_timezone: Generated<string>;
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

export interface TeamMembers {
  id: Generated<number>;
  team_id: string;
  user_id: string;
  created_at: Generated<Date>;
}

export interface Sites {
  id: Generated<string>;
  name: string;
  /** Optional description of the site (a building, park, or other place). */
  description: string | null;
  /** Optional postal address of the site. */
  address: string | null;
  organization_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Rooms {
  id: Generated<string>;
  name: string;
  description: Generated<string>;
  /** The site this room belongs to. */
  site_id: string;
  organization_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WorkRoles {
  id: Generated<number>;
  name: string;
  description: Generated<string>;
  organization_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface Certifications {
  id: Generated<number>;
  name: string;
  description: Generated<string>;
  organization_id: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserWorkRoles {
  id: Generated<number>;
  user_id: string;
  work_role_id: number;
  is_qualified: Generated<boolean>;
  notes: Generated<string>;
  created_at: Generated<Date>;
}

export interface UserCertifications {
  id: Generated<number>;
  user_id: string;
  certification_id: number;
  certification_date: Date | null;
  valid_until_date: Date | null;
  created_at: Generated<Date>;
}

export interface CertificationWorkRoles {
  id: Generated<number>;
  work_role_id: number;
  certification_id: number;
  created_at: Generated<Date>;
}

export interface Notifications {
  id: Generated<number>;
  user_id: string;
  /** The organization this notification belongs to, if any. */
  organization_id: string | null;
  title: string;
  body: Generated<string>;
  is_read: Generated<boolean>;
  created_at: Generated<Date>;
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

export interface EventSeriesTable {
  id: Generated<number>;
  title: string;
  description: string | null;
  calendar_id: string;
  /** The site the event is assigned to (nullable). */
  site_id: string | null;
  /** The specific room within the site (nullable). */
  room_id: string | null;
  /** When true and a site is assigned without a room, the whole site is reserved. */
  reserve_whole_site: Generated<boolean>;
  start: Date;
  duration_minutes: number;
  is_all_day: Generated<boolean>;
  rrule: string | null;
  timezone: Generated<string>;
  is_visible: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EventSeriesTeams {
  id: Generated<number>;
  event_series_id: number;
  team_id: string;
  created_at: Generated<Date>;
}

export interface EventOccurrences {
  id: Generated<number>;
  event_series_id: number;
  /** The original occurrence start in the series (stable identity). */
  occurrence_start: Date;
  /** Whether this occurrence is cancelled. */
  is_cancelled: Generated<boolean>;
  /** Rescheduled start, if any. */
  override_start: Date | null;
  /** Rescheduled end, if any. */
  override_end: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EventWorkRoles {
  id: Generated<number>;
  event_series_id: number;
  /** NULL = parent (series-level) slot; non-NULL = inherited occurrence slot. */
  event_occurrence_id: number | null;
  /** Which parent slot this occurrence slot was inherited from. */
  inherited_from_work_role_id: number | null;
  title: string;
  description: Generated<string>;
  /** Whether this slot must be filled for the event to proceed. */
  is_critical: Generated<boolean>;
  /** The work role this slot is for, if linked to the work role catalog. */
  work_role_id: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface EventWorkRoleAssignments {
  id: Generated<number>;
  event_work_role_id: number;
  user_id: string;
  created_at: Generated<Date>;
}

export interface EventComments {
  id: Generated<number>;
  event_series_id: number;
  /** NULL = series-wide comment; non-NULL = scoped to one occurrence. */
  event_occurrence_id: number | null;
  user_id: string;
  body: string;
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
  team_members: TeamMembers;
  sites: Sites;
  rooms: Rooms;
  work_roles: WorkRoles;
  certifications: Certifications;
  user_work_roles: UserWorkRoles;
  user_certifications: UserCertifications;
  certification_work_roles: CertificationWorkRoles;
  notifications: Notifications;
  calendars: Calendars;
  event_types: EventTypes;
  event_type_roles: EventTypeRoles;
  event_series: EventSeriesTable;
  event_series_teams: EventSeriesTeams;
  event_occurrences: EventOccurrences;
  event_work_roles: EventWorkRoles;
  event_work_role_assignments: EventWorkRoleAssignments;
  event_comments: EventComments;
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

export type Team = Selectable<Teams>;
export type NewTeam = Insertable<Teams>;
export type TeamUpdate = Updateable<Teams>;

export type TeamMember = Selectable<TeamMembers>;
export type NewTeamMember = Insertable<TeamMembers>;

export type Site = Selectable<Sites>;
export type NewSite = Insertable<Sites>;
export type SiteUpdate = Updateable<Sites>;

export type Room = Selectable<Rooms>;
export type NewRoom = Insertable<Rooms>;
export type RoomUpdate = Updateable<Rooms>;

export type WorkRole = Selectable<WorkRoles>;
export type NewWorkRole = Insertable<WorkRoles>;
export type WorkRoleUpdate = Updateable<WorkRoles>;

export type Certification = Selectable<Certifications>;
export type NewCertification = Insertable<Certifications>;
export type CertificationUpdate = Updateable<Certifications>;

export type UserWorkRole = Selectable<UserWorkRoles>;
export type NewUserWorkRole = Insertable<UserWorkRoles>;
export type UserWorkRoleUpdate = Updateable<UserWorkRoles>;

export type UserCertification = Selectable<UserCertifications>;
export type NewUserCertification = Insertable<UserCertifications>;
export type UserCertificationUpdate = Updateable<UserCertifications>;

export type CertificationWorkRole = Selectable<CertificationWorkRoles>;
export type NewCertificationWorkRole = Insertable<CertificationWorkRoles>;

export type Notification = Selectable<Notifications>;
export type NewNotification = Insertable<Notifications>;
export type NotificationUpdate = Updateable<Notifications>;

export type Calendar = Selectable<Calendars>;
export type NewCalendar = Insertable<Calendars>;

export type EventSeries = Selectable<EventSeriesTable>;
export type NewEventSeries = Insertable<EventSeriesTable>;
export type EventSeriesUpdate = Updateable<EventSeriesTable>;

export type EventSeriesTeam = Selectable<EventSeriesTeams>;
export type NewEventSeriesTeam = Insertable<EventSeriesTeams>;

export type EventOccurrenceRow = Selectable<EventOccurrences>;
export type NewEventOccurrenceRow = Insertable<EventOccurrences>;

export type EventWorkRole = Selectable<EventWorkRoles>;
export type NewEventWorkRole = Insertable<EventWorkRoles>;
export type EventWorkRoleUpdate = Updateable<EventWorkRoles>;

export type EventWorkRoleAssignment = Selectable<EventWorkRoleAssignments>;
export type NewEventWorkRoleAssignment = Insertable<EventWorkRoleAssignments>;

export type EventComment = Selectable<EventComments>;
export type NewEventComment = Insertable<EventComments>;
export type EventCommentUpdate = Updateable<EventComments>;
