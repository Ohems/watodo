import { describe, expect, it } from 'vitest';
import i18n from './i18n/index.js';
import {
  validateAbsenceForm,
  validateEventSeriesForm,
  validateOrganizationUpdate,
  validateTeamUpdate,
  validateUserSelfUpdate,
} from './validation.js';

const t = i18n.getFixedT('en');

describe('validateUserSelfUpdate', () => {
  it('accepts valid data', () => {
    expect(
      validateUserSelfUpdate(
        {
          name: 'Alice',
          email: 'alice@example.com',
          description: 'About Alice',
          phoneNumber: '+358401234567',
        },
        t,
      ),
    ).toEqual({});
  });

  it('accepts a cleared phone number', () => {
    expect(
      validateUserSelfUpdate({ name: 'Alice', email: 'alice@example.com', phoneNumber: null }, t),
    ).toEqual({});
  });

  it('requires a name', () => {
    const errors = validateUserSelfUpdate({ name: '   ', email: 'alice@example.com' }, t);
    expect(errors.name).toBe('Name is required');
  });

  it('requires a valid email address', () => {
    const errors = validateUserSelfUpdate({ name: 'Alice', email: 'not-an-email' }, t);
    expect(errors.email).toBe('Enter a valid email address');
  });

  it('requires the country code in the phone number', () => {
    const errors = validateUserSelfUpdate(
      { name: 'Alice', email: 'alice@example.com', phoneNumber: '0401234567' },
      t,
    );
    expect(errors.phoneNumber).toBe(
      'Phone number must include the country code (e.g. +358401234567)',
    );
  });
});

describe('validateOrganizationUpdate', () => {
  it('accepts valid data', () => {
    expect(
      validateOrganizationUpdate(
        { name: 'Community Org', description: '', defaultTimezone: 'Europe/Helsinki' },
        t,
      ),
    ).toEqual({});
  });

  it('requires a name', () => {
    expect(validateOrganizationUpdate({ name: '' }, t).name).toBe('Name is required');
  });

  it('requires a default timezone', () => {
    const errors = validateOrganizationUpdate({ name: 'Org', defaultTimezone: ' ' }, t);
    expect(errors.defaultTimezone).toBe('Default timezone is required');
  });

  it('limits the default timezone length', () => {
    const errors = validateOrganizationUpdate({ name: 'Org', defaultTimezone: 'x'.repeat(65) }, t);
    expect(errors.defaultTimezone).toBe('Default timezone must be at most 64 characters');
  });
});

describe('validateEventSeriesForm', () => {
  const valid = {
    title: 'Summer Festival',
    calendarId: 'cal-1',
    start: '2025-07-15T10:00',
    durationMinutes: '60',
  };

  it('accepts valid data', () => {
    expect(validateEventSeriesForm(valid, t)).toEqual({});
  });

  it('requires a title', () => {
    expect(validateEventSeriesForm({ ...valid, title: '  ' }, t).title).toBe('Title is required');
  });

  it('requires a calendar', () => {
    expect(validateEventSeriesForm({ ...valid, calendarId: '' }, t).calendarId).toBe(
      'Calendar is required',
    );
  });

  it('requires a start', () => {
    expect(validateEventSeriesForm({ ...valid, start: '' }, t).start).toBe('Start is required');
  });

  it('requires a positive duration', () => {
    expect(validateEventSeriesForm({ ...valid, durationMinutes: '0' }, t).durationMinutes).toBe(
      'Duration must be a positive number of minutes',
    );
    expect(validateEventSeriesForm({ ...valid, durationMinutes: 'abc' }, t).durationMinutes).toBe(
      'Duration must be a positive number of minutes',
    );
  });
});

describe('validateTeamUpdate', () => {
  it('accepts valid data', () => {
    expect(validateTeamUpdate({ name: 'Setup Team' }, t)).toEqual({});
  });

  it('requires a name', () => {
    expect(validateTeamUpdate({ name: ' ' }, t).name).toBe('Name is required');
  });
});

describe('validateAbsenceForm', () => {
  it('accepts valid data', () => {
    expect(validateAbsenceForm({ startDate: '2025-07-01', endDate: '2025-07-10' }, t)).toEqual({});
  });

  it('rejects an end date before the start date', () => {
    const errors = validateAbsenceForm({ startDate: '2025-07-10', endDate: '2025-07-01' }, t);
    expect(errors.endDate).toBe('End date must not be before the start date');
  });
});
