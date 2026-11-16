import type { TFunction } from 'i18next';
import type { FieldErrors, OrganizationUpdate, TeamUpdate, UserSelfUpdate } from './types/index.js';

/** E.164 phone number: a plus sign, a non-zero country code and 6-14 digits. */
const PHONE_NUMBER_PATTERN = /^\+[1-9]\d{6,14}$/;

/** Pragmatic email check matching the backend's email validation. */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

/**
 * Validates the account form before it is sent to the API. Returns the field
 * errors with translatable messages; an empty object means the data is valid.
 */
export function validateUserSelfUpdate(data: UserSelfUpdate, t: TFunction): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.name || data.name.trim().length === 0) {
    errors.name = t('validation.nameRequired');
  }
  if (!data.email || !EMAIL_PATTERN.test(data.email)) {
    errors.email = t('validation.emailInvalid');
  }
  if (data.phoneNumber && !PHONE_NUMBER_PATTERN.test(data.phoneNumber)) {
    errors.phoneNumber = t('validation.phoneNumberInvalid');
  }
  return errors;
}

/**
 * Validates the organization form before it is sent to the API. Returns the
 * field errors with translatable messages; an empty object means the data is
 * valid.
 */
export function validateOrganizationUpdate(data: OrganizationUpdate, t: TFunction): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.name || data.name.trim().length === 0) {
    errors.name = t('validation.nameRequired');
  }
  if (!data.defaultTimezone || data.defaultTimezone.trim().length === 0) {
    errors.defaultTimezone = t('validation.defaultTimezoneRequired');
  } else if (data.defaultTimezone.length > 64) {
    errors.defaultTimezone = t('validation.defaultTimezoneTooLong');
  }
  return errors;
}

/** Raw values of the event series dialog form (duration is still a string). */
export interface EventSeriesFormValues {
  title: string;
  calendarId: string;
  start: string;
  durationMinutes: string;
}

/**
 * Validates the event series dialog before it is sent to the API. Returns the
 * field errors with translatable messages; an empty object means the data is
 * valid.
 */
export function validateEventSeriesForm(data: EventSeriesFormValues, t: TFunction): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.title || data.title.trim().length === 0) {
    errors.title = t('events.titleRequired');
  }
  if (!data.calendarId) {
    errors.calendarId = t('events.calendarRequired');
  }
  if (!data.start) {
    errors.start = t('events.startRequired');
  }
  const duration = Number.parseInt(data.durationMinutes, 10);
  if (Number.isNaN(duration) || duration < 1) {
    errors.durationMinutes = t('events.durationInvalid');
  }
  return errors;
}

/**
 * Validates a team create/edit form before it is sent to the API. Returns the
 * field errors with translatable messages; an empty object means the data is
 * valid.
 */
export function validateTeamUpdate(data: Pick<TeamUpdate, 'name'>, t: TFunction): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.name || data.name.trim().length === 0) {
    errors.name = t('validation.nameRequired');
  }
  return errors;
}

/** Raw values of the absence dialog form (dates in `yyyy-mm-dd` format). */
export interface AbsenceFormValues {
  startDate: string;
  endDate: string;
}

/**
 * Validates the absence dialog before it is sent to the API. Returns the field
 * errors with translatable messages; an empty object means the data is valid.
 */
export function validateAbsenceForm(data: AbsenceFormValues, t: TFunction): FieldErrors {
  const errors: FieldErrors = {};
  if (data.startDate !== '' && data.endDate !== '' && data.endDate < data.startDate) {
    errors.endDate = t('absences.endBeforeStart');
  }
  return errors;
}
