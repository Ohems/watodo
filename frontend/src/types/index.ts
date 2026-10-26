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

export interface OpAssignment {
  id: number;
  operationId: number;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Operation {
  id: number;
  name: string;
  description: string;
  requirements: string;
  location: string;
  createdAt: string;
  updatedAt: string;
  assignments: OpAssignment[];
}

export interface OperationInput {
  id?: number;
  name: string;
  description?: string;
  requirements?: string;
  location?: string;
  assignments?: Array<{ id?: number; name: string; description?: string }>;
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

export interface EventJobAssignment {
  id: number;
  jobId: number;
  userId: string;
  userName: string;
  createdAt: string;
}

export interface EventJob {
  id: number;
  seriesId: number;
  occurrenceStart: string | null;
  title: string;
  description: string;
  assignments: EventJobAssignment[];
  createdAt: string;
  updatedAt: string;
}

export interface EventJobPush {
  title: string;
  description?: string;
  occurrenceStart?: string | null;
}

export type EventJobUpdate = Partial<EventJobPush>;

export interface EventComment {
  id: number;
  seriesId: number;
  occurrenceStart: string | null;
  userId: string;
  userName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventOccurrenceDetail {
  series: EventSeries;
  occurrence: EventOccurrence;
  jobs: EventJob[];
  comments: EventComment[];
}

// --- Teams ---

export interface Team {
  id: string;
  name: string;
  description: string;
  organizationId: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeamPush {
  name: string;
  description?: string;
  organizationId: string;
}

export interface TeamUpdate {
  name?: string;
  description?: string;
}

export interface TeamMember {
  id: number;
  teamId: string;
  userId: string;
  userName: string;
  userEmail: string;
  createdAt: string;
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

// --- Jobs ---

export interface Job {
  id: number;
  name: string;
  organizationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobPush {
  name: string;
  organizationId: string;
}

export interface JobUpdate {
  name?: string;
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
