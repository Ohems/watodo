import type { Transaction } from 'kysely';
import { db } from '../database.js';
import type { Absence, Database } from '../db/types.js';
import { notFound } from '../http-error.js';
import { createLogger } from '../logger.js';
import type { AbsencePush, AbsenceQuery, AbsenceUpdate } from '../schemas/index.js';
import {
  expandOccurrences,
  type OccurrenceExceptionRule,
  type RecurrenceSeriesRule,
} from './recurrence.js';

type Tx = Transaction<Database>;

const logger = createLogger('absence-service');

export interface AbsenceResponse {
  id: number;
  userId: string;
  type: string;
  description: string;
  /** First day of the absence (inclusive), ISO date. */
  startDate: string;
  /** Last day of the absence (inclusive), ISO date. */
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

function serializeAbsence(absence: Absence): AbsenceResponse {
  return {
    id: absence.id,
    userId: absence.user_id,
    type: absence.type,
    description: absence.description,
    startDate: absence.start_date.toISOString().slice(0, 10),
    endDate: absence.end_date.toISOString().slice(0, 10),
    createdAt: absence.created_at.toISOString(),
    updatedAt: absence.updated_at.toISOString(),
  };
}

/** Converts an ISO date (YYYY-MM-DD) to the UTC midnight Date of that day. */
function dateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * The UTC instant at which an absence starts (midnight of the first day) and
 * the exclusive end (midnight of the day after the last day).
 */
export function absenceRange(
  startDate: string,
  endDate: string,
): { start: Date; endExclusive: Date } {
  const start = dateToUtc(startDate);
  const endExclusive = new Date(dateToUtc(endDate).getTime() + 24 * 60 * 60 * 1000);
  return { start, endExclusive };
}

/** Today as an ISO date (UTC), used for "currently active" checks. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getOwnAbsenceOrThrow(absenceId: number, userId: string): Promise<Absence> {
  const absence = await db
    .selectFrom('absences')
    .selectAll()
    .where('id', '=', absenceId)
    .where('user_id', '=', userId)
    .executeTakeFirst();
  if (!absence) {
    throw notFound(`Absence ${absenceId} not found!`);
  }
  return absence;
}

/**
 * Lists the absences of a user, optionally narrowed to those overlapping the
 * given inclusive date range.
 */
export async function listAbsences(
  userId: string,
  query: AbsenceQuery = {},
): Promise<AbsenceResponse[]> {
  logger.trace('absenceService.listAbsences');
  let q = db.selectFrom('absences').selectAll().where('user_id', '=', userId);
  if (query.start) {
    // Overlap: the absence ends on or after the range start.
    q = q.where('end_date', '>=', dateToUtc(query.start));
  }
  if (query.end) {
    // Overlap: the absence starts on or before the range end.
    q = q.where('start_date', '<=', dateToUtc(query.end));
  }
  const rows = await q.orderBy('start_date', 'asc').execute();
  return rows.map(serializeAbsence);
}

/**
 * Returns the IDs of the given users that have an absence overlapping the
 * given instant range [rangeStart, rangeEnd). Absence days are interpreted as
 * UTC days.
 */
export async function usersWithAbsenceInRange(
  userIds: string[],
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0) return result;
  const rows = await db
    .selectFrom('absences')
    .select(['user_id', 'start_date', 'end_date'])
    .where('user_id', 'in', userIds)
    .execute();
  for (const row of rows) {
    const { start, endExclusive } = absenceRange(
      row.start_date.toISOString().slice(0, 10),
      row.end_date.toISOString().slice(0, 10),
    );
    if (start.getTime() < rangeEnd.getTime() && endExclusive.getTime() > rangeStart.getTime()) {
      result.add(row.user_id);
    }
  }
  return result;
}

/**
 * Returns the IDs of the given users that currently have an active absence
 * (today lies within [start_date, end_date], UTC).
 */
export async function usersWithActiveAbsence(userIds: string[]): Promise<Set<string>> {
  const result = new Set<string>();
  if (userIds.length === 0) return result;
  const today = todayUtc();
  const rows = await db
    .selectFrom('absences')
    .select('user_id')
    .where('user_id', 'in', userIds)
    .where('start_date', '<=', dateToUtc(today))
    .where('end_date', '>=', dateToUtc(today))
    .execute();
  for (const row of rows) {
    result.add(row.user_id);
  }
  return result;
}

/** The user's assignments, as slot ID -> assignment ID. */
async function fetchUserAssignmentsBySlot(tx: Tx, userId: string): Promise<Map<number, number>> {
  const rows = await tx
    .selectFrom('event_work_role_assignments')
    .select(['id', 'event_work_role_id'])
    .where('user_id', '=', userId)
    .execute();
  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.event_work_role_id, row.id);
  }
  return map;
}

interface AffectedOccurrence {
  seriesId: number;
  title: string;
  occurrenceStart: Date;
  start: Date;
  end: Date;
  assignmentIds: number[];
}

/**
 * Finds the user's work role slot assignments on event occurrences that
 * overlap [rangeStart, rangeEnd). Series-wide slots cover every occurrence;
 * occurrence-level slots apply only when the occurrence is materialized and
 * has its own slots (mirroring the effective-slot rule used elsewhere).
 * Cancelled occurrences are ignored.
 */
async function findOverlappingAssignments(
  tx: Tx,
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<AffectedOccurrence[]> {
  const assignmentsBySlot = await fetchUserAssignmentsBySlot(tx, userId);
  if (assignmentsBySlot.size === 0) return [];

  const slotRows = await tx
    .selectFrom('event_work_roles')
    .select(['id', 'event_series_id', 'event_occurrence_id'])
    .where('id', 'in', [...assignmentsBySlot.keys()])
    .execute();
  const seriesIds = [...new Set(slotRows.map(row => row.event_series_id))];
  if (seriesIds.length === 0) return [];

  const parentSlotsBySeries = new Map<number, number[]>();
  const occurrenceSlotIdsByOccurrenceId = new Map<number, number[]>();
  for (const row of slotRows) {
    if (row.event_occurrence_id === null) {
      const list = parentSlotsBySeries.get(row.event_series_id) ?? [];
      list.push(row.id);
      parentSlotsBySeries.set(row.event_series_id, list);
    } else {
      const list = occurrenceSlotIdsByOccurrenceId.get(row.event_occurrence_id) ?? [];
      list.push(row.id);
      occurrenceSlotIdsByOccurrenceId.set(row.event_occurrence_id, list);
    }
  }

  // All slots of the involved series (needed to know whether a materialized
  // occurrence has its own slots, in which case the parent slots do not apply).
  const allSlotRows = await tx
    .selectFrom('event_work_roles')
    .select(['id', 'event_series_id', 'event_occurrence_id'])
    .where('event_series_id', 'in', seriesIds)
    .execute();
  const allOccurrenceSlotsByOccurrenceId = new Map<number, number[]>();
  const allParentSlotsBySeries = new Map<number, number[]>();
  for (const row of allSlotRows) {
    if (row.event_occurrence_id === null) {
      const list = allParentSlotsBySeries.get(row.event_series_id) ?? [];
      list.push(row.id);
      allParentSlotsBySeries.set(row.event_series_id, list);
    } else {
      const list = allOccurrenceSlotsByOccurrenceId.get(row.event_occurrence_id) ?? [];
      list.push(row.id);
      allOccurrenceSlotsByOccurrenceId.set(row.event_occurrence_id, list);
    }
  }

  const seriesRows = await tx
    .selectFrom('event_series')
    .selectAll()
    .where('id', 'in', seriesIds)
    .execute();

  const exceptionsBySeries = new Map<number, OccurrenceExceptionRule[]>();
  const exceptionRows = await tx
    .selectFrom('event_occurrences')
    .selectAll()
    .where('event_series_id', 'in', seriesIds)
    .execute();
  for (const row of exceptionRows) {
    const list = exceptionsBySeries.get(row.event_series_id) ?? [];
    list.push({
      id: row.id,
      occurrenceStart: row.occurrence_start,
      isCancelled: row.is_cancelled,
      overrideStart: row.override_start,
      overrideEnd: row.override_end,
    });
    exceptionsBySeries.set(row.event_series_id, list);
  }

  // Materialized occurrence IDs by `${seriesId}:${occurrenceStartISO}`.
  const occurrenceIdByKey = new Map<string, number>();
  for (const row of exceptionRows) {
    occurrenceIdByKey.set(`${row.event_series_id}:${row.occurrence_start.toISOString()}`, row.id);
  }

  const affected: AffectedOccurrence[] = [];
  for (const series of seriesRows) {
    const rule: RecurrenceSeriesRule = {
      start: series.start,
      durationMinutes: series.duration_minutes,
      rrule: series.rrule,
      timezone: series.timezone,
    };
    const exceptions = exceptionsBySeries.get(series.id) ?? [];
    const occurrences = expandOccurrences(rule, exceptions, rangeStart, rangeEnd);
    for (const occurrence of occurrences) {
      if (occurrence.exception?.isCancelled) continue;
      const occurrenceId = occurrenceIdByKey.get(
        `${series.id}:${occurrence.occurrenceStart.toISOString()}`,
      );
      const ownSlots =
        occurrenceId !== undefined
          ? (allOccurrenceSlotsByOccurrenceId.get(occurrenceId) ?? [])
          : [];
      const effectiveSlots =
        ownSlots.length > 0 ? ownSlots : (allParentSlotsBySeries.get(series.id) ?? []);
      const assignmentIds = effectiveSlots
        .filter(slotId => assignmentsBySlot.has(slotId))
        .map(slotId => assignmentsBySlot.get(slotId) as number);
      if (assignmentIds.length === 0) continue;
      affected.push({
        seriesId: series.id,
        title: series.title,
        occurrenceStart: occurrence.occurrenceStart,
        start: occurrence.start,
        end: occurrence.end,
        assignmentIds,
      });
    }
  }
  return affected;
}

/** The users managing a series: team leaders and manager members of connected teams. */
async function fetchSeriesManagerIds(tx: Tx, seriesId: number): Promise<string[]> {
  const teamRows = await tx
    .selectFrom('event_series_teams')
    .select('team_id')
    .where('event_series_id', '=', seriesId)
    .execute();
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map(row => row.team_id);
  const teams = await tx
    .selectFrom('teams')
    .select(['id', 'team_leader_id'])
    .where('id', 'in', teamIds)
    .execute();
  const managerRows = await tx
    .selectFrom('team_members')
    .select('user_id')
    .where('team_id', 'in', teamIds)
    .where('is_manager', '=', true)
    .execute();
  const ids = new Set<string>();
  for (const team of teams) {
    if (team.team_leader_id) ids.add(team.team_leader_id);
  }
  for (const row of managerRows) {
    ids.add(row.user_id);
  }
  return [...ids];
}

/** The organization a series belongs to (via its calendar), for notifications. */
async function fetchSeriesOrganizationId(tx: Tx, seriesId: number): Promise<string | null> {
  const row = await tx
    .selectFrom('event_series')
    .innerJoin('calendars', 'calendars.id', 'event_series.calendar_id')
    .select('calendars.organization_id')
    .where('event_series.id', '=', seriesId)
    .executeTakeFirst();
  return row?.organization_id ?? null;
}

/**
 * Removes the user's assignments on occurrences overlapping the absence range
 * and notifies the managers of each affected series. Runs inside the caller's
 * transaction.
 */
async function removeOverlappingAssignmentsAndNotify(
  tx: Tx,
  userId: string,
  userName: string,
  absence: { type: string; startDate: string; endDate: string },
  rangeStart: Date,
  rangeEnd: Date,
): Promise<number> {
  const affected = await findOverlappingAssignments(tx, userId, rangeStart, rangeEnd);
  let removed = 0;
  for (const occurrence of affected) {
    await tx
      .deleteFrom('event_work_role_assignments')
      .where('id', 'in', occurrence.assignmentIds)
      .execute();
    removed += occurrence.assignmentIds.length;

    const organizationId = await fetchSeriesOrganizationId(tx, occurrence.seriesId);
    const managerIds = (await fetchSeriesManagerIds(tx, occurrence.seriesId)).filter(
      id => id !== userId,
    );
    const startText = occurrence.start.toISOString();
    for (const managerId of managerIds) {
      await tx
        .insertInto('notifications')
        .values({
          user_id: managerId,
          organization_id: organizationId,
          message_key: 'assignmentRemovedDueToAbsence',
          params: {
            userName,
            eventTitle: occurrence.title,
            start: startText,
            absenceType: absence.type,
            absenceStart: absence.startDate,
            absenceEnd: absence.endDate,
          },
        })
        .execute();
    }
  }
  return removed;
}

/**
 * Creates an absence for the user. When the absence overlaps an event
 * occurrence the user is assigned to, the assignment is removed and the
 * event's managers receive a notification.
 */
export async function createAbsence(userId: string, data: AbsencePush): Promise<AbsenceResponse> {
  logger.trace('absenceService.createAbsence');
  const user = await db
    .selectFrom('users')
    .select(['id', 'name'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  const { start, endExclusive } = absenceRange(data.startDate, data.endDate);
  return db.transaction().execute(async tx => {
    const absence = await tx
      .insertInto('absences')
      .values({
        user_id: userId,
        type: data.type,
        description: data.description ?? '',
        start_date: dateToUtc(data.startDate),
        end_date: dateToUtc(data.endDate),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    await removeOverlappingAssignmentsAndNotify(tx, userId, user.name, data, start, endExclusive);
    return serializeAbsence(absence);
  });
}

/**
 * Updates one of the user's own absences. Assignments overlapping the new
 * range are removed (same as on create).
 */
export async function updateAbsence(
  absenceId: number,
  userId: string,
  data: AbsenceUpdate,
): Promise<AbsenceResponse> {
  logger.trace('absenceService.updateAbsence');
  await getOwnAbsenceOrThrow(absenceId, userId);
  const user = await db
    .selectFrom('users')
    .select(['id', 'name'])
    .where('id', '=', userId)
    .executeTakeFirstOrThrow();
  return db.transaction().execute(async tx => {
    const updated = await tx
      .updateTable('absences')
      .set({
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.startDate !== undefined ? { start_date: dateToUtc(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { end_date: dateToUtc(data.endDate) } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', absenceId)
      .where('user_id', '=', userId)
      .returningAll()
      .executeTakeFirstOrThrow();
    const startDate = updated.start_date.toISOString().slice(0, 10);
    const endDate = updated.end_date.toISOString().slice(0, 10);
    const { start, endExclusive } = absenceRange(startDate, endDate);
    await removeOverlappingAssignmentsAndNotify(
      tx,
      userId,
      user.name,
      { type: updated.type, startDate, endDate },
      start,
      endExclusive,
    );
    return serializeAbsence(updated);
  });
}

/** Deletes one of the user's own absences. */
export async function deleteAbsence(absenceId: number, userId: string): Promise<void> {
  logger.trace('absenceService.deleteAbsence');
  await getOwnAbsenceOrThrow(absenceId, userId);
  await db
    .deleteFrom('absences')
    .where('id', '=', absenceId)
    .where('user_id', '=', userId)
    .execute();
}
