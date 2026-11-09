import { describe, expect, it } from 'vitest';
import {
  DATE_FORMAT_HINTS,
  DATE_FORMAT_PATTERNS,
  DATE_PICKER_PATTERNS,
  formatDate,
  formatDateTime,
  TIME_FORMAT_HINTS,
  TIME_FORMAT_PATTERNS,
  TIME_PICKER_PATTERNS,
} from './format.js';

// Built via the local-time constructor so expectations are timezone-independent.
const date = new Date(2026, 5, 15, 9, 5); // 2026-06-15 09:05 local time

describe('formatDate', () => {
  it('formats as YMD by default', () => {
    expect(formatDate(date, 'ymd')).toBe('2026-06-15');
  });

  it('formats as MDY', () => {
    expect(formatDate(date, 'mdy')).toBe('06/15/2026');
  });

  it('formats as DMY', () => {
    expect(formatDate(date, 'dmy')).toBe('15/06/2026');
  });
});

describe('formatDateTime', () => {
  it('formats with a 24-hour clock', () => {
    expect(formatDateTime(date, 'ymd', '24h')).toBe('2026-06-15 09:05');
    expect(formatDateTime(new Date(2026, 5, 15, 14, 30), 'ymd', '24h')).toBe('2026-06-15 14:30');
  });

  it('formats with a 12-hour clock', () => {
    expect(formatDateTime(new Date(2026, 5, 15, 14, 30), 'dmy', '12h')).toBe('15/06/2026 02:30 PM');
    expect(formatDateTime(new Date(2026, 5, 15, 9, 5), 'mdy', '12h')).toBe('06/15/2026 09:05 AM');
  });

  it('accepts ISO strings', () => {
    expect(formatDateTime(date.toISOString(), 'ymd', '24h')).toBe('2026-06-15 09:05');
  });
});

describe('format patterns', () => {
  it('covers every date and time format option in every pattern map', () => {
    const dateFormats = ['dmy', 'mdy', 'ymd'];
    const timeFormats = ['12h', '24h'];
    expect(Object.keys(DATE_FORMAT_PATTERNS).sort()).toEqual(dateFormats);
    expect(Object.keys(DATE_FORMAT_HINTS).sort()).toEqual(dateFormats);
    expect(Object.keys(DATE_PICKER_PATTERNS).sort()).toEqual(dateFormats);
    expect(Object.keys(TIME_FORMAT_PATTERNS).sort()).toEqual(timeFormats);
    expect(Object.keys(TIME_FORMAT_HINTS).sort()).toEqual(timeFormats);
    expect(Object.keys(TIME_PICKER_PATTERNS).sort()).toEqual(timeFormats);
  });
});
