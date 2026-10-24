import { Group, Loader, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../api/index.js';
import Calendar, { type CalendarEvent } from '../../components/Calendar/Calendar.js';
import EventOccurrenceDialog from '../../components/EventOccurrenceDialog/EventOccurrenceDialog.js';
import type { EventOccurrence } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function Home() {
  const { t } = useTranslation();
  const now = new Date();
  const [range, setRange] = useState(() => ({
    start: startOfMonth(now),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  }));
  const [occurrences, setOccurrences] = useState<EventOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{
    seriesId: number;
    occurrenceStart: string;
  } | null>(null);

  const loadOccurrences = useCallback(async (start: Date, end: Date) => {
    setLoading(true);
    try {
      // Pad the visible range so occurrences overlapping its edges are included.
      const data = await eventsApi.getOccurrences(
        new Date(start.getTime() - DAY_MS),
        new Date(end.getTime() + 2 * DAY_MS),
      );
      setOccurrences(data);
    } catch {
      setOccurrences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOccurrences(range.start, range.end);
  }, [range, loadOccurrences]);

  const events: CalendarEvent[] = occurrences
    .filter(occurrence => !occurrence.isCancelled)
    .map(occurrence => ({
      title: occurrence.isRescheduled
        ? `${occurrence.title} (${t('events.rescheduled')})`
        : occurrence.title,
      start: new Date(occurrence.start),
      end: new Date(occurrence.end),
      allDay: occurrence.isAllDay,
      resource: occurrence,
    }));

  return (
    <div style={{ padding: 16 }}>
      <Group gap="md" mb="sm">
        <Title order={2}>{t('home.title')}</Title>
        {loading && <Loader size="sm" />}
      </Group>
      <Calendar
        events={events}
        onRangeChange={newRange => setRange(newRange)}
        onSelectEvent={event => {
          const occurrence = event.resource as EventOccurrence | undefined;
          if (occurrence) {
            setSelected({
              seriesId: occurrence.seriesId,
              occurrenceStart: occurrence.occurrenceStart,
            });
          }
        }}
      />
      <EventOccurrenceDialog
        seriesId={selected?.seriesId ?? null}
        occurrenceStart={selected?.occurrenceStart ?? null}
        onClose={() => setSelected(null)}
        onChanged={() => loadOccurrences(range.start, range.end)}
      />
    </div>
  );
}

export default Home;
