import { getDate, getHours, getMinutes, getMonth, getSeconds, getYear } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import type { ByWeekday, Frequency, Options, Weekday } from 'rrule';
// The rrule package ships a CommonJS build whose named exports are not
// statically analyzable by Node's ESM loader, so it is imported through its
// default export (the whole module namespace).
import rrule from 'rrule';
import { badRequest } from '../http-error.js';
import type { RecurrenceInput } from '../schemas/index.js';

const { RRule } = rrule;

// Maximum span of an occurrence range query. Chosen to comfortably cover
// series that repeat 5-10 years into the future.
export const MAX_OCCURRENCE_RANGE_MS = 3700 * 24 * 60 * 60 * 1000; // ~10.1 years

const DAY_MS = 24 * 60 * 60 * 1000;

// The part of an event series needed to expand occurrences.
export interface RecurrenceSeriesRule {
  start: Date;
  durationMinutes: number;
  rrule: string | null;
  timezone: string;
}

// A per-occurrence override (cancel / reschedule).
export interface OccurrenceExceptionRule {
  id: number;
  occurrenceStart: Date;
  isCancelled: boolean;
  overrideStart: Date | null;
  overrideEnd: Date | null;
}

export interface ExpandedOccurrence {
  // The original occurrence start; the occurrence's identity. Job slots,
  // comments and exceptions are keyed by it.
  occurrenceStart: Date;
  // Effective start/end after applying a reschedule override.
  start: Date;
  end: Date;
  exception: OccurrenceExceptionRule | null;
}

const RRULE_WEEKDAYS: readonly Weekday[] = [
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
  RRule.SU,
];

const FREQ_BY_NAME: Record<NonNullable<RecurrenceInput>['freq'], Frequency> = {
  YEARLY: RRule.YEARLY,
  MONTHLY: RRule.MONTHLY,
  WEEKLY: RRule.WEEKLY,
  DAILY: RRule.DAILY,
};

const FREQ_NAMES: readonly NonNullable<RecurrenceInput>['freq'][] = [
  'YEARLY',
  'MONTHLY',
  'WEEKLY',
  'DAILY',
];

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// Returns a Date whose UTC components equal the wall-clock time of `date` in
// `timezone`. rrule (running in wall-clock mode, see below) works with Dates
// shaped exactly like this.
export function toWallClockDate(date: Date, timezone: string): Date {
  const zoned = toZonedTime(date, timezone);
  return new Date(
    Date.UTC(
      getYear(zoned),
      getMonth(zoned),
      getDate(zoned),
      getHours(zoned),
      getMinutes(zoned),
      getSeconds(zoned),
    ),
  );
}

// Inverse of toWallClockDate: interprets the UTC components of `wallClock`
// as a wall-clock time in `timezone` and returns the real UTC instant.
// DST-correct and independent of the server's process timezone.
export function fromWallClockDate(wallClock: Date, timezone: string): Date {
  const local = new Date(
    wallClock.getUTCFullYear(),
    wallClock.getUTCMonth(),
    wallClock.getUTCDate(),
    wallClock.getUTCHours(),
    wallClock.getUTCMinutes(),
    wallClock.getUTCSeconds(),
    wallClock.getUTCMilliseconds(),
  );
  return fromZonedTime(local, timezone);
}

// ISO weekday (1 = Monday .. 7 = Sunday) of a wall-clock Date.
function isoWeekdayOf(wallClock: Date): number {
  return ((wallClock.getUTCDay() + 6) % 7) + 1;
}

// Builds the canonical RRULE property string for a series from the structured
// recurrence input, using the rrule library as the serializer. `until` is an
// instant and is stored as the wall-clock time in the series' timezone,
// because the rule is evaluated in wall-clock space.
export function buildRruleString(
  series: { start: Date; timezone: string },
  recurrence: NonNullable<RecurrenceInput>,
): string {
  const options: Partial<Options> = {
    freq: FREQ_BY_NAME[recurrence.freq],
    dtstart: toWallClockDate(series.start, series.timezone),
  };
  if (recurrence.interval !== undefined) {
    options.interval = recurrence.interval;
  }
  if (recurrence.freq === 'WEEKLY') {
    // A weekly rule defaults to the weekday of the first occurrence.
    const weekdays = recurrence.byWeekdays ?? [isoWeekdayOf(options.dtstart as Date)];
    options.byweekday = weekdays.map(iso => RRULE_WEEKDAYS[iso - 1]);
  } else if (recurrence.freq === 'DAILY' && recurrence.byWeekdays !== undefined) {
    // For daily rules BYDAY is a filter (e.g. weekdays only); without it the
    // series repeats every day.
    options.byweekday = recurrence.byWeekdays.map(iso => RRULE_WEEKDAYS[iso - 1]);
  }
  if (recurrence.freq === 'MONTHLY') {
    options.bymonthday = recurrence.byMonthDays ?? [(options.dtstart as Date).getUTCDate()];
  }
  if (recurrence.until !== undefined) {
    options.until = toWallClockDate(new Date(recurrence.until), series.timezone);
  }
  if (recurrence.count !== undefined) {
    options.count = recurrence.count;
  }

  let rule: InstanceType<typeof RRule>;
  try {
    rule = new RRule(options);
  } catch (error) {
    throw badRequest(`Invalid recurrence rule: ${(error as Error).message}`);
  }

  const line = rule
    .toString()
    .split('\n')
    .find(l => l.startsWith('RRULE:'));
  if (!line) {
    throw new Error('Failed to serialize recurrence rule');
  }
  return line;
}

// Ensures a recurrence rule contains the given wall-clock start as an
// occurrence. Used when a series is split and re-anchored at a new start:
// rrule does not generate a dtstart that does not match the BYxxx filters,
// so for WEEKLY/DAILY rules the start's weekday is added to byWeekdays and
// for MONTHLY rules the start's day is added to byMonthDays. Rules without
// the respective filter already contain every start (the builder defaults
// them to the start's weekday/day), and YEARLY rules always contain their
// start.
export function anchorRecurrenceAtStart(
  recurrence: NonNullable<RecurrenceInput>,
  startWallClock: Date,
): NonNullable<RecurrenceInput> {
  if (
    (recurrence.freq === 'WEEKLY' || recurrence.freq === 'DAILY') &&
    recurrence.byWeekdays !== undefined
  ) {
    const weekday = isoWeekdayOf(startWallClock);
    if (!recurrence.byWeekdays.includes(weekday)) {
      return {
        ...recurrence,
        byWeekdays: [...recurrence.byWeekdays, weekday].sort((a, b) => a - b),
      };
    }
    return recurrence;
  }
  if (recurrence.freq === 'MONTHLY' && recurrence.byMonthDays !== undefined) {
    const day = startWallClock.getUTCDate();
    if (!recurrence.byMonthDays.includes(day)) {
      return {
        ...recurrence,
        byMonthDays: [...recurrence.byMonthDays, day].sort((a, b) => a - b),
      };
    }
    return recurrence;
  }
  return recurrence;
}

// Truncates a series' stored RRULE string so the series ends just before the
// given occurrence (used when splitting a series at an occurrence): the rule
// gets an UNTIL one millisecond before the occurrence, and any COUNT is
// dropped because the UNTIL always caps earlier (the occurrence itself is
// within the original rule).
export function truncateRruleString(
  series: { start: Date; timezone: string },
  rruleString: string,
  occurrenceStart: Date,
): string {
  const recurrence = recurrenceFromRruleString(series, rruleString);
  const truncated: NonNullable<RecurrenceInput> = {
    ...recurrence,
    count: undefined,
    until: new Date(occurrenceStart.getTime() - 1).toISOString(),
  };
  return buildRruleString(series, truncated);
}

// Rebuilds the structured recurrence input from the stored RRULE string.
export function recurrenceFromRruleString(
  series: { start: Date; timezone: string },
  rruleString: string,
): NonNullable<RecurrenceInput> {
  const rule = parseStoredRrule(series, rruleString);
  const options = rule.origOptions;

  const freq = options.freq !== undefined ? FREQ_NAMES[options.freq] : undefined;
  if (!freq) {
    throw new Error(`Invalid stored rrule "${rruleString}": missing FREQ`);
  }

  const recurrence: Record<string, unknown> = { freq };
  if (options.interval !== undefined) {
    recurrence.interval = options.interval;
  }
  if (options.count !== undefined && options.count !== null) {
    recurrence.count = options.count;
  }
  if (options.until) {
    recurrence.until = fromWallClockDate(options.until, series.timezone).toISOString();
  }

  const byweekday = toByWeekdayArray(options.byweekday);
  if (byweekday.length > 0) {
    recurrence.byWeekdays = byweekday.map(byWeekdayToIso);
  }
  const bymonthday = toNumberArray(options.bymonthday);
  if (bymonthday.length > 0) {
    recurrence.byMonthDays = bymonthday;
  }

  return recurrence as NonNullable<RecurrenceInput>;
}

// Parses the stored RRULE string and rebuilds the rrule instance in wall-clock
// mode: no `tzid` option, because rrule's own timezone rezoning depends on the
// server's process timezone. The rule therefore generates wall-clock dates
// (Dates whose UTC components are the wall-clock in the series timezone),
// which are converted to real instants with date-fns-tz afterwards.
function parseStoredRrule(
  series: { start: Date; timezone: string },
  rruleString: string,
): InstanceType<typeof RRule> {
  let parsed: Partial<Options>;
  try {
    parsed = RRule.parseString(rruleString);
  } catch (error) {
    throw new Error(`Invalid stored rrule "${rruleString}": ${(error as Error).message}`);
  }
  if (parsed.freq === undefined) {
    throw new Error(`Invalid stored rrule "${rruleString}": missing FREQ`);
  }
  try {
    return new RRule({ ...parsed, dtstart: toWallClockDate(series.start, series.timezone) });
  } catch (error) {
    throw new Error(`Invalid stored rrule "${rruleString}": ${(error as Error).message}`);
  }
}

function toByWeekdayArray(byweekday: Partial<Options>['byweekday']): ByWeekday[] {
  if (byweekday === null || byweekday === undefined) return [];
  return Array.isArray(byweekday) ? byweekday : [byweekday];
}

function toNumberArray(value: number | number[] | null | undefined): number[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function byWeekdayToIso(byweekday: ByWeekday): number {
  if (typeof byweekday === 'number') return byweekday + 1;
  if (typeof byweekday === 'string') {
    const index = RRULE_WEEKDAYS.findIndex(weekday => weekday.toString() === byweekday);
    return index + 1;
  }
  return byweekday.weekday + 1;
}

// Expands the occurrences of a series that overlap [rangeStart, rangeEnd),
// applying per-occurrence exceptions (cancel / reschedule). Occurrences are
// computed on demand; nothing is materialized, so series repeating years or
// indefinitely into the future are expanded in bounded time.
export function expandOccurrences(
  series: RecurrenceSeriesRule,
  exceptions: OccurrenceExceptionRule[],
  rangeStart: Date,
  rangeEnd: Date,
): ExpandedOccurrence[] {
  const durationMs = series.durationMinutes * 60 * 1000;
  const exceptionsByOccurrence = new Map<number, OccurrenceExceptionRule>();
  for (const exception of exceptions) {
    exceptionsByOccurrence.set(exception.occurrenceStart.getTime(), exception);
  }

  const results: ExpandedOccurrence[] = [];
  const included = new Set<number>();
  const overlapsRange = (start: Date, end: Date): boolean =>
    end.getTime() > rangeStart.getTime() && start.getTime() < rangeEnd.getTime();

  const addOccurrence = (original: Date, exception: OccurrenceExceptionRule | undefined): void => {
    if (exception?.isCancelled) return;
    let start = original;
    let end = new Date(original.getTime() + durationMs);
    if (exception?.overrideStart) {
      start = exception.overrideStart;
      end = exception.overrideEnd ?? new Date(start.getTime() + durationMs);
    }
    if (!overlapsRange(start, end)) return;
    included.add(original.getTime());
    results.push({ occurrenceStart: original, start, end, exception: exception ?? null });
  };

  if (!series.rrule) {
    // Single, non-repeating event.
    addOccurrence(series.start, exceptionsByOccurrence.get(series.start.getTime()));
  } else {
    const rule = parseStoredRrule(series, series.rrule);
    // Widen the wall-clock window by the event duration plus a day on each
    // side so occurrences overlapping the range edges (multi-day events,
    // timezone offsets, DST) are not missed. Results are filtered by real
    // overlap in addOccurrence.
    const after = toWallClockDate(
      new Date(rangeStart.getTime() - durationMs - DAY_MS),
      series.timezone,
    );
    const before = toWallClockDate(new Date(rangeEnd.getTime() + DAY_MS), series.timezone);
    for (const wallClock of rule.between(after, before, true)) {
      const original = fromWallClockDate(wallClock, series.timezone);
      addOccurrence(original, exceptionsByOccurrence.get(original.getTime()));
    }
  }

  // Rescheduled occurrences whose original occurrence falls outside the
  // expansion window must still surface when their new time is in range.
  for (const exception of exceptions) {
    if (exception.isCancelled || !exception.overrideStart) continue;
    if (included.has(exception.occurrenceStart.getTime())) continue;
    addOccurrence(exception.occurrenceStart, exception);
  }

  results.sort((a, b) => a.start.getTime() - b.start.getTime());
  return results;
}

// Whether `date` is an occurrence of the series (used to validate
// occurrence-scoped operations).
export function isOccurrence(series: RecurrenceSeriesRule, date: Date): boolean {
  if (!series.rrule) {
    return date.getTime() === series.start.getTime();
  }
  const wallClock = toWallClockDate(date, series.timezone);
  const rule = parseStoredRrule(series, series.rrule);
  const hits = rule.between(
    new Date(wallClock.getTime() - 1),
    new Date(wallClock.getTime() + 1),
    true,
  );
  return hits.some(hit => fromWallClockDate(hit, series.timezone).getTime() === date.getTime());
}
