import { describe, expect, it } from 'vitest';
import type { RecurrenceInput } from '../src/schemas/index.js';
import {
  anchorRecurrenceAtStart,
  buildRruleString,
  expandOccurrences,
  fromWallClockDate,
  isOccurrence,
  isValidTimezone,
  type OccurrenceExceptionRule,
  type RecurrenceSeriesRule,
  recurrenceFromRruleString,
  toWallClockDate,
  truncateRruleString,
} from '../src/services/recurrence.js';

let exceptionId = 0;
function exception(
  occurrenceStart: Date,
  overrides: Partial<Omit<OccurrenceExceptionRule, 'id' | 'occurrenceStart'>> = {},
): OccurrenceExceptionRule {
  exceptionId += 1;
  return {
    id: exceptionId,
    occurrenceStart,
    isCancelled: false,
    overrideStart: null,
    overrideEnd: null,
    ...overrides,
  };
}

function series(overrides: Partial<RecurrenceSeriesRule> = {}): RecurrenceSeriesRule {
  return {
    start: new Date('2026-10-21T16:00:00.000Z'), // Wednesday 18:00 Europe/Berlin (CEST)
    durationMinutes: 60,
    rrule: null,
    timezone: 'Europe/Berlin',
    ...overrides,
  };
}

const range = (start: string, end: string) => [new Date(start), new Date(end)] as const;

describe('isValidTimezone', () => {
  it('accepts IANA timezones and UTC', () => {
    expect(isValidTimezone('Europe/Berlin')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('America/New_York')).toBe(true);
  });

  it('rejects unknown timezones', () => {
    expect(isValidTimezone('Not/AZone')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });
});

describe('wall-clock conversion', () => {
  it('converts instants to wall-clock dates and back', () => {
    const instant = new Date('2026-10-21T16:00:00.000Z'); // 18:00 in Berlin (CEST)
    const wall = toWallClockDate(instant, 'Europe/Berlin');
    expect(wall.toISOString()).toBe('2026-10-21T18:00:00.000Z');
    expect(fromWallClockDate(wall, 'Europe/Berlin').toISOString()).toBe(instant.toISOString());
  });

  it('is DST-correct in both directions', () => {
    // Winter: 18:00 Berlin (CET) = 17:00Z
    const winter = new Date('2026-11-02T17:00:00.000Z');
    const wall = toWallClockDate(winter, 'Europe/Berlin');
    expect(wall.toISOString()).toBe('2026-11-02T18:00:00.000Z');
    expect(fromWallClockDate(wall, 'Europe/Berlin').toISOString()).toBe(winter.toISOString());
  });
});

describe('buildRruleString', () => {
  it('builds a weekly rule with explicit weekdays', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
      { freq: 'WEEKLY', byWeekdays: [1, 3] },
    );
    expect(rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE');
  });

  it('defaults weekly rules to the weekday of the start', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'UTC' },
      { freq: 'WEEKLY' },
    );
    expect(rrule).toBe('RRULE:FREQ=WEEKLY;BYDAY=WE');
  });

  it('builds daily rules with a weekday filter', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'UTC' },
      { freq: 'DAILY', byWeekdays: [1, 2, 3, 4, 5] },
    );
    expect(rrule).toBe('RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR');
  });

  it('builds monthly rules with month days', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-01-15T10:00:00.000Z'), timezone: 'UTC' },
      { freq: 'MONTHLY', byMonthDays: [1, 15] },
    );
    expect(rrule).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15');
  });

  it('defaults monthly rules to the day of month of the start', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-01-15T10:00:00.000Z'), timezone: 'UTC' },
      { freq: 'MONTHLY' },
    );
    expect(rrule).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=15');
  });

  it('includes interval, count and until', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'UTC' },
      { freq: 'DAILY', interval: 2, count: 10 },
    );
    expect(rrule).toBe('RRULE:FREQ=DAILY;INTERVAL=2;COUNT=10');

    const withUntil = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'UTC' },
      { freq: 'DAILY', until: '2026-12-31T23:00:00.000Z' },
    );
    expect(withUntil).toBe('RRULE:FREQ=DAILY;UNTIL=20261231T230000Z');
  });
});

describe('recurrenceFromRruleString', () => {
  it('round-trips a weekly rule', () => {
    const input = { freq: 'WEEKLY' as const, byWeekdays: [1, 3], interval: 2 };
    const rrule = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
      input,
    );
    expect(
      recurrenceFromRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
        rrule,
      ),
    ).toEqual(input);
  });

  it('round-trips until as an instant', () => {
    const rrule = buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
      { freq: 'DAILY', until: '2026-12-31T23:00:00.000Z' },
    );
    const parsed = recurrenceFromRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
      rrule,
    );
    expect(parsed).toEqual({ freq: 'DAILY', until: '2026-12-31T23:00:00.000Z' });
  });
});

describe('expandOccurrences', () => {
  it('expands a single non-repeating event', () => {
    const [rangeStart, rangeEnd] = range('2026-10-21T00:00:00.000Z', '2026-10-22T00:00:00.000Z');
    const occurrences = expandOccurrences(series(), [], rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].occurrenceStart.toISOString()).toBe('2026-10-21T16:00:00.000Z');
    expect(occurrences[0].end.toISOString()).toBe('2026-10-21T17:00:00.000Z');
  });

  it('returns nothing for a single event outside the range', () => {
    const [rangeStart, rangeEnd] = range('2026-11-01T00:00:00.000Z', '2026-11-02T00:00:00.000Z');
    expect(expandOccurrences(series(), [], rangeStart, rangeEnd)).toHaveLength(0);
  });

  it('expands a weekly rule with DST-correct instants', () => {
    const rule = series({
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
        { freq: 'WEEKLY', byWeekdays: [1, 3] },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-10-21T00:00:00.000Z', '2026-11-05T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    expect(occurrences.map(o => o.start.toISOString())).toEqual([
      '2026-10-21T16:00:00.000Z', // Wed 18:00 CEST
      '2026-10-26T17:00:00.000Z', // Mon 18:00 CET (DST ended Oct 25)
      '2026-10-28T17:00:00.000Z', // Wed 18:00 CET
      '2026-11-02T17:00:00.000Z', // Mon 18:00 CET
      '2026-11-04T17:00:00.000Z', // Wed 18:00 CET
    ]);
  });

  it('excludes cancelled occurrences', () => {
    const rule = series({
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
        { freq: 'WEEKLY', byWeekdays: [1, 3] },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-10-21T00:00:00.000Z', '2026-11-05T00:00:00.000Z');
    const exceptions = [exception(new Date('2026-10-28T17:00:00.000Z'), { isCancelled: true })];
    const occurrences = expandOccurrences(rule, exceptions, rangeStart, rangeEnd);
    expect(occurrences.map(o => o.start.toISOString())).toEqual([
      '2026-10-21T16:00:00.000Z',
      '2026-10-26T17:00:00.000Z',
      '2026-11-02T17:00:00.000Z',
      '2026-11-04T17:00:00.000Z',
    ]);
  });

  it('moves rescheduled occurrences to their new time', () => {
    const rule = series({
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
        { freq: 'WEEKLY', byWeekdays: [1, 3] },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-10-21T00:00:00.000Z', '2026-11-05T00:00:00.000Z');
    const original = new Date('2026-10-28T17:00:00.000Z');
    const exceptions = [
      exception(original, {
        overrideStart: new Date('2026-10-30T10:00:00.000Z'),
        overrideEnd: new Date('2026-10-30T11:00:00.000Z'),
      }),
    ];
    const occurrences = expandOccurrences(rule, exceptions, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(5);
    const moved = occurrences.find(o => o.occurrenceStart.getTime() === original.getTime());
    expect(moved).toBeDefined();
    expect(moved?.start.toISOString()).toBe('2026-10-30T10:00:00.000Z');
    expect(moved?.end.toISOString()).toBe('2026-10-30T11:00:00.000Z');
    expect(moved?.exception?.id).toBe(exceptions[0].id);
    // The original slot is gone.
    expect(occurrences.some(o => o.start.toISOString() === '2026-10-28T17:00:00.000Z')).toBe(false);
  });

  it('hides occurrences rescheduled out of the range', () => {
    const rule = series({
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
        { freq: 'WEEKLY', byWeekdays: [1, 3] },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-10-21T00:00:00.000Z', '2026-11-05T00:00:00.000Z');
    const exceptions = [
      exception(new Date('2026-10-28T17:00:00.000Z'), {
        overrideStart: new Date('2026-12-25T10:00:00.000Z'),
      }),
    ];
    const occurrences = expandOccurrences(rule, exceptions, rangeStart, rangeEnd);
    expect(occurrences.map(o => o.start.toISOString())).toEqual([
      '2026-10-21T16:00:00.000Z',
      '2026-10-26T17:00:00.000Z',
      '2026-11-02T17:00:00.000Z',
      '2026-11-04T17:00:00.000Z',
    ]);
  });

  it('surfaces occurrences rescheduled into the range from outside it', () => {
    const rule = series({
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
        { freq: 'WEEKLY', byWeekdays: [1, 3] },
      ),
    });
    // Range far away from the original occurrence.
    const [rangeStart, rangeEnd] = range('2026-11-10T00:00:00.000Z', '2026-11-30T00:00:00.000Z');
    const original = new Date('2026-10-21T16:00:00.000Z');
    const exceptions = [
      exception(original, {
        overrideStart: new Date('2026-11-20T10:00:00.000Z'),
        overrideEnd: new Date('2026-11-20T11:00:00.000Z'),
      }),
    ];
    const occurrences = expandOccurrences(rule, exceptions, rangeStart, rangeEnd);
    // The rule generates its own occurrences in the range (Nov 11, 16, 18,
    // 23, 25), plus the rescheduled one moved in from October.
    const moved = occurrences.filter(
      o => o.occurrenceStart.toISOString() === original.toISOString(),
    );
    expect(moved).toHaveLength(1);
    expect(moved[0].start.toISOString()).toBe('2026-11-20T10:00:00.000Z');
    expect(moved[0].end.toISOString()).toBe('2026-11-20T11:00:00.000Z');
  });

  it('includes multi-day events overlapping the range start', () => {
    const rule = series({
      start: new Date('2026-10-20T16:00:00.000Z'),
      durationMinutes: 3 * 24 * 60,
      timezone: 'UTC',
    });
    const [rangeStart, rangeEnd] = range('2026-10-22T00:00:00.000Z', '2026-10-23T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].end.toISOString()).toBe('2026-10-23T16:00:00.000Z');
  });

  it('respects COUNT', () => {
    const rule = series({
      start: new Date('2026-10-21T16:00:00.000Z'),
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY', count: 5 },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    expect(occurrences.map(o => o.start.toISOString())).toEqual([
      '2026-10-21T16:00:00.000Z',
      '2026-10-22T16:00:00.000Z',
      '2026-10-23T16:00:00.000Z',
      '2026-10-24T16:00:00.000Z',
      '2026-10-25T16:00:00.000Z',
    ]);
  });

  it('respects UNTIL', () => {
    const rule = series({
      start: new Date('2026-10-21T16:00:00.000Z'),
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY', until: '2026-12-31T23:00:00.000Z' },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-10-01T00:00:00.000Z', '2027-06-01T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(72); // Oct 21 .. Dec 31 inclusive
    expect(occurrences[0].start.toISOString()).toBe('2026-10-21T16:00:00.000Z');
    expect(occurrences[occurrences.length - 1].start.toISOString()).toBe(
      '2026-12-31T16:00:00.000Z',
    );
  });

  it('expands monthly rules', () => {
    const rule = series({
      start: new Date('2026-01-15T10:00:00.000Z'),
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-01-15T10:00:00.000Z'), timezone: 'UTC' },
        { freq: 'MONTHLY' },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    expect(occurrences.map(o => o.start.toISOString())).toEqual([
      '2026-01-15T10:00:00.000Z',
      '2026-02-15T10:00:00.000Z',
      '2026-03-15T10:00:00.000Z',
      '2026-04-15T10:00:00.000Z',
      '2026-05-15T10:00:00.000Z',
    ]);
  });

  it('expands a daily series 10 years into the future', () => {
    const rule = series({
      start: new Date('2026-01-01T09:00:00.000Z'),
      durationMinutes: 30,
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-01-01T09:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY' },
      ),
    });
    // A one-month window ten years out.
    const [rangeStart, rangeEnd] = range('2036-06-01T00:00:00.000Z', '2036-07-01T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(30);
    expect(occurrences[0].start.toISOString()).toBe('2036-06-01T09:00:00.000Z');
    expect(occurrences[29].start.toISOString()).toBe('2036-06-30T09:00:00.000Z');
  });

  it('expands a daily series over its full 10-year span', () => {
    const rule = series({
      start: new Date('2026-01-01T09:00:00.000Z'),
      durationMinutes: 30,
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-01-01T09:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY' },
      ),
    });
    const [rangeStart, rangeEnd] = range('2026-01-01T00:00:00.000Z', '2036-12-31T23:59:59.000Z');
    const occurrences = expandOccurrences(rule, [], rangeStart, rangeEnd);
    // 2026-01-01 .. 2036-12-31 inclusive: 11 years with 3 leap days.
    expect(occurrences).toHaveLength(4018);
    expect(occurrences[0].start.toISOString()).toBe('2026-01-01T09:00:00.000Z');
    expect(occurrences[occurrences.length - 1].start.toISOString()).toBe(
      '2036-12-31T09:00:00.000Z',
    );
  });

  it('applies exceptions to series far in the future', () => {
    const rule = series({
      start: new Date('2026-01-01T09:00:00.000Z'),
      durationMinutes: 30,
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-01-01T09:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY' },
      ),
    });
    const cancelled = new Date('2036-06-15T09:00:00.000Z');
    const exceptions = [exception(cancelled, { isCancelled: true })];
    const [rangeStart, rangeEnd] = range('2036-06-01T00:00:00.000Z', '2036-07-01T00:00:00.000Z');
    const occurrences = expandOccurrences(rule, exceptions, rangeStart, rangeEnd);
    expect(occurrences).toHaveLength(29);
    expect(occurrences.some(o => o.start.getTime() === cancelled.getTime())).toBe(false);
  });
});

describe('isOccurrence', () => {
  const rule = series({
    rrule: buildRruleString(
      { start: new Date('2026-10-21T16:00:00.000Z'), timezone: 'Europe/Berlin' },
      { freq: 'WEEKLY', byWeekdays: [1, 3] },
    ),
  });

  it('accepts occurrences of the rule', () => {
    expect(isOccurrence(rule, new Date('2026-10-21T16:00:00.000Z'))).toBe(true);
    expect(isOccurrence(rule, new Date('2026-11-02T17:00:00.000Z'))).toBe(true);
  });

  it('rejects dates that are not occurrences', () => {
    expect(isOccurrence(rule, new Date('2026-10-22T16:00:00.000Z'))).toBe(false);
    expect(isOccurrence(rule, new Date('2026-10-21T17:00:00.000Z'))).toBe(false);
  });

  it('checks the single event for non-repeating series', () => {
    const single = series();
    expect(isOccurrence(single, new Date('2026-10-21T16:00:00.000Z'))).toBe(true);
    expect(isOccurrence(single, new Date('2026-10-21T16:00:00.001Z'))).toBe(false);
    expect(isOccurrence(single, new Date('2026-10-28T16:00:00.000Z'))).toBe(false);
  });

  it('finds occurrences 10 years out', () => {
    const daily = series({
      start: new Date('2026-01-01T09:00:00.000Z'),
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-01-01T09:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY' },
      ),
    });
    expect(isOccurrence(daily, new Date('2036-06-15T09:00:00.000Z'))).toBe(true);
    expect(isOccurrence(daily, new Date('2036-06-15T09:00:01.000Z'))).toBe(false);
  });
});

describe('anchorRecurrenceAtStart', () => {
  const wall = (iso: string) => toWallClockDate(new Date(iso), 'UTC');

  it('adds the start weekday to a weekly rule', () => {
    // Rule: Mondays only; new start is a Thursday.
    const anchored = anchorRecurrenceAtStart(
      { freq: 'WEEKLY', byWeekdays: [1] },
      wall('2026-11-05T14:00:00.000Z'),
    );
    expect(anchored).toEqual({ freq: 'WEEKLY', byWeekdays: [1, 4] });
    const rruleString = buildRruleString(
      { start: new Date('2026-11-05T14:00:00.000Z'), timezone: 'UTC' },
      anchored,
    );
    expect(
      isOccurrence(
        {
          start: new Date('2026-11-05T14:00:00.000Z'),
          durationMinutes: 60,
          rrule: rruleString,
          timezone: 'UTC',
        },
        new Date('2026-11-05T14:00:00.000Z'),
      ),
    ).toBe(true);
  });

  it('is a no-op when the start weekday is already included', () => {
    const recurrence: NonNullable<RecurrenceInput> = { freq: 'WEEKLY', byWeekdays: [1, 3] };
    expect(anchorRecurrenceAtStart(recurrence, wall('2026-11-04T10:00:00.000Z'))).toEqual(
      recurrence,
    );
  });

  it('adds the start day to a monthly rule', () => {
    const anchored = anchorRecurrenceAtStart(
      { freq: 'MONTHLY', byMonthDays: [26] },
      wall('2026-11-28T10:00:00.000Z'),
    );
    expect(anchored).toEqual({ freq: 'MONTHLY', byMonthDays: [26, 28] });
  });

  it('adds the start weekday to a daily rule with a weekday filter', () => {
    const anchored = anchorRecurrenceAtStart(
      { freq: 'DAILY', byWeekdays: [1, 2, 3, 4, 5] },
      wall('2026-11-07T10:00:00.000Z'),
    ); // Saturday
    expect(anchored).toEqual({ freq: 'DAILY', byWeekdays: [1, 2, 3, 4, 5, 6] });
  });

  it('leaves rules without filters and yearly rules unchanged', () => {
    const daily = { freq: 'DAILY' } as const;
    expect(anchorRecurrenceAtStart(daily, wall('2026-11-07T10:00:00.000Z'))).toEqual(daily);
    const yearly = { freq: 'YEARLY' } as const;
    expect(anchorRecurrenceAtStart(yearly, wall('2026-11-07T10:00:00.000Z'))).toEqual(yearly);
  });
});

describe('truncateRruleString', () => {
  it('ends the series just before the split occurrence', () => {
    const rule = series({
      start: new Date('2026-10-26T10:00:00.000Z'),
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-10-26T10:00:00.000Z'), timezone: 'UTC' },
        { freq: 'WEEKLY', byWeekdays: [1, 3] },
      ),
    });
    const truncated = truncateRruleString(
      rule,
      rule.rrule as string,
      new Date('2026-11-04T10:00:00.000Z'),
    );
    expect(truncated).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261104T095959Z');
    const occurrences = expandOccurrences(
      { ...rule, rrule: truncated },
      [],
      ...range('2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'),
    );
    expect(occurrences.map(o => o.occurrenceStart.toISOString())).toEqual([
      '2026-10-26T10:00:00.000Z',
      '2026-10-28T10:00:00.000Z',
      '2026-11-02T10:00:00.000Z',
    ]);
  });

  it('drops a count limit when truncating', () => {
    const rule = series({
      start: new Date('2026-10-26T10:00:00.000Z'),
      timezone: 'UTC',
      rrule: buildRruleString(
        { start: new Date('2026-10-26T10:00:00.000Z'), timezone: 'UTC' },
        { freq: 'DAILY', count: 100 },
      ),
    });
    const truncated = truncateRruleString(
      rule,
      rule.rrule as string,
      new Date('2026-10-28T10:00:00.000Z'),
    );
    expect(truncated).toContain('UNTIL=');
    expect(truncated).not.toContain('COUNT=');
    const occurrences = expandOccurrences(
      { ...rule, rrule: truncated },
      [],
      ...range('2026-10-01T00:00:00.000Z', '2027-01-01T00:00:00.000Z'),
    );
    expect(occurrences.map(o => o.occurrenceStart.toISOString())).toEqual([
      '2026-10-26T10:00:00.000Z',
      '2026-10-27T10:00:00.000Z',
    ]);
  });
});
