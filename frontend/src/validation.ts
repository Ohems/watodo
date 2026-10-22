import type { TFunction } from 'i18next';
import type { FieldErrors, OrganizationUpdate, UserSelfUpdate } from './types/index.js';

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
