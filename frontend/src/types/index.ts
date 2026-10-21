export interface User {
  id: string;
  name: string;
  email: string;
  description: string;
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

export interface ApiError {
  error: string;
  statusCode: number;
}

export interface Organization {
  id: string;
  name: string;
  defaultTimezone: string;
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

// ISO 8601 weekday: 1 = Monday .. 7 = Sunday.
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
