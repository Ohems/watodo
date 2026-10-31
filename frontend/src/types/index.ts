export interface User {
  id: string;
  name: string;
  email: string;
  description: string;
  /** Optional contact number in E.164 format (includes the country code). */
  phoneNumber: string | null;
  permissions: string[];
  state: 'active' | 'inactive';
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPush {
  name?: string;
  email?: string;
  description?: string | null;
  state?: 'active' | 'inactive';
}

/** Fields a user may change on their own account (no `state`). */
export interface UserSelfUpdate {
  name?: string;
  email?: string;
  description?: string | null;
  /** E.164 format (includes the country code); null clears the number. */
  phoneNumber?: string | null;
}

/** A login method (OAuth provider account) connected to the user's account. */
export interface AuthAccount {
  provider: string;
  providerAccountId: string;
  createdAt: string;
}

export interface UserListItem {
  id: string;
  name: string;
}

export interface AuthProviderInfo {
  id: string;
  name: string;
  configured: boolean;
}

/** Maps field names to their validation error messages. */
export type FieldErrors = Record<string, string>;

export interface Organization {
  id: string;
  name: string;
  description: string;
  defaultTimezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationUpdate {
  name?: string;
  description?: string;
  defaultTimezone?: string;
}

export interface Calendar {
  id: string;
  name: string;
  googleCalendarId: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarPush {
  name: string;
  organizationId: string;
  googleCalendarId?: string | null;
}

/** ISO 8601 weekday: 1 = Monday .. 7 = Sunday. */
export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface RecurrenceInput {
  freq: RecurrenceFreq;
  interval?: number;
  byWeekdays?: number[];
  byMonthDays?: number[];
  until?: string;
  count?: number;
}

export interface EventSeries {
  id: number;
  title: string;
  description: string | null;
  calendarId: string;
  siteId: string | null;
  roomId: string | null;
  reserveWholeSite: boolean;
  start: string;
  durationMinutes: number;
  isAllDay: boolean;
  timezone: string;
  isVisible: boolean;
  rrule: string | null;
  recurrence: RecurrenceInput | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventSeriesPush {
  title: string;
  description?: string | null;
  calendarId: string;
  start: string;
  durationMinutes?: number;
  isAllDay?: boolean;
  timezone?: string;
  isVisible?: boolean;
  recurrence?: RecurrenceInput | null;
}

export type EventSeriesUpdate = Partial<EventSeriesPush>;

export interface EventOccurrence {
  /** Stable ID of the materialized occurrence instance, or null if not yet materialized. */
  occurrenceId: number | null;
  seriesId: number;
  title: string;
  description: string | null;
  isAllDay: boolean;
  siteId: string | null;
  roomId: string | null;
  reserveWholeSite: boolean;
  organizationId: string;
  organizationName: string;
  occurrenceStart: string;
  start: string;
  end: string;
  isRescheduled: boolean;
  isCancelled: boolean;
  exceptionId: number | null;
}

/**
 * Builds the URL reference for an occurrence: the stable numeric ID when
 * materialized, or a temporary `tmp:{seriesId}:{isoStart}` key otherwise.
 */
export function occurrenceRef(
  occurrence: Pick<EventOccurrence, 'occurrenceId' | 'seriesId' | 'occurrenceStart'>,
): string {
  return occurrence.occurrenceId !== null
    ? String(occurrence.occurrenceId)
    : `tmp:${occurrence.seriesId}:${occurrence.occurrenceStart}`;
}

export interface EventException {
  id: number;
  seriesId: number;
  occurrenceStart: string;
  isCancelled: boolean;
  overrideStart: string | null;
  overrideEnd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventWorkRoleAssignment {
  id: number;
  eventWorkRoleId: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface EventWorkRole {
  id: number;
  seriesId: number;
  /** NULL = parent (series-level) slot; non-NULL = occurrence-level inherited slot. */
  occurrenceId: number | null;
  inheritedFromWorkRoleId: number | null;
  title: string;
  description: string;
  isCritical: boolean;
  workRoleId: number | null;
  workRoleName: string | null;
  assignments: EventWorkRoleAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface EventWorkRolePush {
  title: string;
  description?: string;
  occurrenceStart?: string | null;
  occurrenceId?: number | null;
  isCritical?: boolean;
  workRoleId?: number | null;
}

export type EventWorkRoleUpdate = Partial<EventWorkRolePush>;

// --- Event readiness ---

export interface RoleReadiness {
  workRoleId: number | null;
  workRoleName: string;
  required: number;
  filled: number;
  isCritical: boolean;
  isUnfilled: boolean;
}

export interface EventReadiness {
  roles: RoleReadiness[];
  isReady: boolean;
  unfilledCriticalCount: number;
}

export interface EventComment {
  id: number;
  seriesId: number;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventOccurrenceDetail {
  series: EventSeries;
  occurrence: EventOccurrence;
  /** Slots visible for this occurrence: occurrence-level + parent-level. */
  workRoles: EventWorkRole[];
  /** Parent (series-level) slots only. */
  parentWorkRoles: EventWorkRole[];
  /** Occurrence-level (inherited) slots only. */
  occurrenceWorkRoles: EventWorkRole[];
  /** Parent slots not yet imported into this occurrence. */
  missingParentWorkRoles: EventWorkRole[];
  comments: EventComment[];
  readiness: EventReadiness;
}

// --- Teams ---

export type TeamType = 'general' | 'event_organizers' | 'role_group';

export interface Team {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  teamType: TeamType;
  teamLeaderId: string | null;
  teamLeaderName: string | null;
  eventTypeId: number | null;
  eventTypeName: string | null;
  workRoleId: number | null;
  workRoleName: string | null;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamPush {
  name: string;
  description?: string;
  organizationId: string;
  teamType?: TeamType;
  teamLeaderId?: string | null;
  eventTypeId?: number | null;
  workRoleId?: number | null;
}

export interface TeamUpdate {
  name?: string;
  description?: string;
  teamType?: TeamType;
  teamLeaderId?: string | null;
  eventTypeId?: number | null;
  workRoleId?: number | null;
}

export interface TeamMember {
  id: number;
  teamId: string;
  userId: string;
  userName: string;
  userEmail: string;
  /** When true, the member can manage this specific team. */
  isManager: boolean;
  createdAt: string;
}

export interface TeamMemberUpdate {
  isManager?: boolean;
}

// --- Sites ---

export interface Site {
  id: string;
  name: string;
  description: string | null;
  address: string | null;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface SitePush {
  name: string;
  description?: string | null;
  address?: string | null;
  organizationId: string;
}

export interface SiteUpdate {
  name?: string;
  description?: string | null;
  address?: string | null;
}

// --- Rooms ---

export interface Room {
  id: string;
  name: string;
  description: string;
  siteId: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoomPush {
  name: string;
  description?: string;
  siteId: string;
  organizationId: string;
}

export interface RoomUpdate {
  name?: string;
  description?: string;
}

// --- Work Roles ---

export interface WorkRole {
  id: number;
  name: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkRolePush {
  name: string;
  description?: string;
  organizationId: string;
}

export interface WorkRoleUpdate {
  name?: string;
  description?: string;
}

export interface WorkRoleDetail extends WorkRole {
  requiredCertifications: Certification[];
  users: UserWorkRole[];
}

// --- Certifications ---

export interface Certification {
  id: number;
  name: string;
  description: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CertificationPush {
  name: string;
  description?: string;
  organizationId: string;
}

export interface CertificationUpdate {
  name?: string;
  description?: string;
}

// --- User Work Roles ---

export interface UserWorkRole {
  id: number;
  userId: string;
  userName: string;
  userEmail: string;
  workRoleId: number;
  workRoleName: string;
  workRoleDescription: string;
  isQualified: boolean;
  notes: string;
  createdAt: string;
}

export interface UserWorkRolePush {
  workRoleId: number;
  isQualified?: boolean;
  notes?: string;
}

export interface UserWorkRoleUpdate {
  isQualified?: boolean;
  notes?: string;
}

// --- User Certifications ---

export interface UserCertification {
  id: number;
  userId: string;
  userName: string;
  certificationId: number;
  certificationName: string;
  certificationDescription: string;
  certificationDate: string | null;
  validUntilDate: string | null;
  createdAt: string;
}

export interface UserCertificationPush {
  certificationId: number;
  certificationDate?: string | null;
  validUntilDate?: string | null;
}

export interface UserCertificationUpdate {
  certificationDate?: string | null;
  validUntilDate?: string | null;
}

// --- Notifications ---

export interface Notification {
  id: number;
  userId: string;
  /** The organization this notification belongs to, if any. */
  organizationId: string | null;
  organizationName: string | null;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

// --- Paginated responses ---

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface PaginatedNotifications extends Paginated<Notification> {
  unreadCount: number;
}

// --- Organization users ---

export interface OrganizationUser {
  id: string;
  name: string;
  email: string;
  description: string;
  isEmployed: boolean;
  isSuspended: boolean;
  isBlocked: boolean;
  state: string;
  createdAt: string;
}

// --- Event series management ---

export interface EventType {
  id: number;
  name: string;
  description: string;
  recurrence: string | null;
  calendarId: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventSeriesTeam {
  id: string;
  name: string;
}

export interface EventSeriesManagement extends EventSeries {
  organizationId: string;
  organizationName: string;
  siteName: string | null;
  roomName: string | null;
  teams: EventSeriesTeam[];
}

export interface EventSeriesConfigUpdate {
  siteId?: string | null;
  roomId?: string | null;
  reserveWholeSite?: boolean;
  teamIds?: string[];
}

export interface EventSeriesListQuery {
  page?: number;
  limit?: number;
  search?: string;
  startFrom?: string;
  startTo?: string;
  siteId?: string;
  roomId?: string;
  teamId?: string;
  hasTeam?: boolean;
  organizationId: string;
}

export interface OccurrenceFilter {
  scope?: 'all' | 'team' | 'mine';
  siteId?: string;
  roomId?: string;
  teamId?: string;
}

// --- Table query ---

export interface TableQuery {
  page?: number;
  limit?: number;
  search?: string;
}
