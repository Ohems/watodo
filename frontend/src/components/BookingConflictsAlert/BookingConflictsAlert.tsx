import { Alert, List } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../hooks/use-formatters.js';
import type { BookingConflict } from '../../types/index.js';

interface BookingConflictsAlertProps {
  conflicts: BookingConflict[] | undefined;
}

/**
 * Yellow warning listing the room/site booking conflicts the backend reported
 * for a saved event (series create/update/split, config change, occurrence
 * reschedule/materialize). The save itself succeeded; this only flags the
 * overlap so the organizer can adjust.
 */
export default function BookingConflictsAlert({ conflicts }: BookingConflictsAlertProps) {
  const { t } = useTranslation();
  const { formatDateTime } = useFormatters();
  if (!conflicts || conflicts.length === 0) return null;
  return (
    <Alert color="yellow" variant="light" title={t('events.bookingConflicts')}>
      <List size="sm" withPadding>
        {conflicts.map(conflict => (
          <List.Item key={`${conflict.seriesId}:${conflict.occurrenceStart}`}>
            {t('events.bookingConflictItem', {
              title: conflict.title,
              start: formatDateTime(conflict.start),
              end: formatDateTime(conflict.end),
            })}
          </List.Item>
        ))}
      </List>
    </Alert>
  );
}
