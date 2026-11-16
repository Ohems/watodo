import { config } from '../config.js';
import { createLogger } from '../logger.js';
import {
  fetchSeriesManagerIds,
  findUnfilledCriticalOccurrences,
} from '../services/event-service.js';
import { createNotification } from '../services/notification-service.js';

const logger = createLogger('critical-slot-alerts');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Notifies the managers of each series (team leaders and manager members of
 * connected teams) about upcoming occurrences that still have unfilled
 * critical slots. Occurrences are expanded on the fly, so this runs as a
 * scheduled job over a look-ahead window of `CRITICAL_SLOT_ALERT_DAYS` days.
 * Each manager gets at most one notification per occurrence per day: the
 * dedup key (`unfilledCriticalSlot:<series>:<occurrenceStart>:<date>`) is
 * unique per user, so re-running the job does not duplicate notifications.
 * @param now - The reference time (defaults to the current time).
 * @returns The number of notifications created.
 */
export async function runCriticalSlotAlerts(now: Date = new Date()): Promise<number> {
  logger.trace('criticalSlotAlerts.runCriticalSlotAlerts');
  const windowEnd = new Date(now.getTime() + config.criticalSlotAlertDays * DAY_MS);
  const occurrences = await findUnfilledCriticalOccurrences(now, windowEnd);
  if (occurrences.length === 0) return 0;

  const dateKey = now.toISOString().slice(0, 10);
  let created = 0;
  for (const occurrence of occurrences) {
    const managerIds = await fetchSeriesManagerIds(occurrence.seriesId);
    for (const managerId of managerIds) {
      const dedupKey = `unfilledCriticalSlot:${occurrence.seriesId}:${occurrence.occurrenceStart.toISOString()}:${dateKey}`;
      const notification = await createNotification(
        managerId,
        'unfilledCriticalSlot',
        {
          eventTitle: occurrence.title,
          start: occurrence.start.toISOString(),
          roles: occurrence.roles.join(', '),
        },
        occurrence.organizationId,
        dedupKey,
      );
      if (notification) created += 1;
    }
  }
  return created;
}

/**
 * Starts the periodic critical-slot alert job. The first run happens
 * immediately; later runs every `CRITICAL_SLOT_ALERT_INTERVAL_MINUTES`
 * minutes. The timer is unref'd so it never keeps the process alive.
 * @returns The interval timer (clear it on shutdown).
 */
export function startCriticalSlotAlertJob(): NodeJS.Timeout {
  const run = async (): Promise<void> => {
    try {
      const created = await runCriticalSlotAlerts();
      if (created > 0) {
        logger.info({ created }, 'Sent unfilled-critical-slot alerts');
      }
    } catch (error) {
      logger.error({ error }, 'Critical slot alert job failed');
    }
  };
  const timer = setInterval(() => void run(), config.criticalSlotAlertIntervalMinutes * 60 * 1000);
  timer.unref();
  void run();
  return timer;
}
