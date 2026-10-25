import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useCreateEventSeriesMutation,
  useSplitEventSeriesMutation,
  useUpdateEventSeriesMutation,
} from '../../api/index.js';
import type {
  Calendar,
  EventSeries,
  EventSeriesPush,
  Organization,
  RecurrenceFreq,
  RecurrenceInput,
} from '../../types/index.js';

interface EventSeriesDialogProps {
  open: boolean;
  series: EventSeries | null;
  // When set, the dialog edits the given occurrence "and all following": the
  // save splits the series so the occurrence starts a new, independent series.
  splitOccurrenceStart?: string | null;
  calendars: Calendar[];
  organizations: Organization[];
  onClose: () => void;
  onSaved: () => void;
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function EventSeriesDialog({
  open,
  series,
  splitOccurrenceStart = null,
  calendars,
  organizations,
  onClose,
  onSaved,
}: EventSeriesDialogProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [splitEventSeries, { isLoading: savingSplit }] = useSplitEventSeriesMutation();
  const [updateEventSeries, { isLoading: savingUpdate }] = useUpdateEventSeriesMutation();
  const [createEventSeries, { isLoading: savingCreate }] = useCreateEventSeriesMutation();
  const saving = savingSplit || savingUpdate || savingCreate;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [calendarId, setCalendarId] = useState('');
  const [start, setStart] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('60');
  const [isAllDay, setIsAllDay] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [timezone, setTimezone] = useState('');

  const [repeats, setRepeats] = useState(false);
  const [freq, setFreq] = useState<RecurrenceFreq>('WEEKLY');
  const [interval, setInterval] = useState('1');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDays, setMonthDays] = useState('');
  const [until, setUntil] = useState('');
  const [count, setCount] = useState('');

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (series) {
      setTitle(series.title);
      setDescription(series.description ?? '');
      setCalendarId(series.calendarId);
      setStart(toLocalInputValue(series.start));
      setDurationMinutes(String(series.durationMinutes));
      setIsAllDay(series.isAllDay);
      setIsVisible(series.isVisible);
      setTimezone(series.timezone);
      const recurrence = series.recurrence;
      setRepeats(recurrence !== null);
      setFreq(recurrence?.freq ?? 'WEEKLY');
      setInterval(String(recurrence?.interval ?? 1));
      setWeekdays(recurrence?.byWeekdays ?? []);
      setMonthDays(recurrence?.byMonthDays?.join(', ') ?? '');
      setUntil(recurrence?.until ? recurrence.until.slice(0, 10) : '');
      setCount(recurrence?.count ? String(recurrence.count) : '');
    } else {
      setTitle('');
      setDescription('');
      setCalendarId(calendars[0]?.id ?? '');
      setStart(toLocalInputValue(new Date().toISOString()));
      setDurationMinutes('60');
      setIsAllDay(false);
      setIsVisible(true);
      setTimezone('');
      setRepeats(false);
      setFreq('WEEKLY');
      setInterval('1');
      setWeekdays([]);
      setMonthDays('');
      setUntil('');
      setCount('');
    }
  }, [open, series, calendars]);

  const selectedCalendar = calendars.find(calendar => calendar.id === calendarId);
  const calendarOrganization = organizations.find(
    organization => organization.id === selectedCalendar?.organizationId,
  );

  const buildRecurrence = (): RecurrenceInput | null => {
    if (!repeats) return null;
    const parsedInterval = Number.parseInt(interval, 10);
    const parsedCount = Number.parseInt(count, 10);
    const parsedMonthDays = monthDays
      .split(',')
      .map(value => Number.parseInt(value.trim(), 10))
      .filter(value => !Number.isNaN(value));
    const recurrence: RecurrenceInput = { freq };
    if (parsedInterval > 1) recurrence.interval = parsedInterval;
    if (freq === 'WEEKLY' && weekdays.length > 0) recurrence.byWeekdays = [...weekdays].sort();
    if (freq === 'DAILY' && weekdays.length > 0) recurrence.byWeekdays = [...weekdays].sort();
    if (freq === 'MONTHLY' && parsedMonthDays.length > 0) recurrence.byMonthDays = parsedMonthDays;
    if (until) recurrence.until = new Date(until).toISOString();
    if (parsedCount > 0) recurrence.count = parsedCount;
    return recurrence;
  };

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError(t('events.titleRequired'));
      return;
    }
    if (!calendarId) {
      setError(t('events.calendarRequired'));
      return;
    }
    if (!start) {
      setError(t('events.startRequired'));
      return;
    }
    const duration = Number.parseInt(durationMinutes, 10);
    if (Number.isNaN(duration) || duration < 1) {
      setError(t('events.durationInvalid'));
      return;
    }

    const payload: EventSeriesPush = {
      title: title.trim(),
      description: description.trim() || null,
      calendarId,
      start: new Date(start).toISOString(),
      durationMinutes: duration,
      isAllDay,
      isVisible,
      recurrence: buildRecurrence(),
    };
    if (timezone.trim()) payload.timezone = timezone.trim();

    try {
      if (splitOccurrenceStart && series) {
        await splitEventSeries({
          seriesId: series.id,
          occurrenceStart: splitOccurrenceStart,
          data: payload,
        }).unwrap();
      } else if (series) {
        await updateEventSeries({ seriesId: series.id, data: payload }).unwrap();
      } else {
        await createEventSeries(payload).unwrap();
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  };

  const weekdayNames: Record<number, string> = {
    1: t('events.weekdayMon'),
    2: t('events.weekdayTue'),
    3: t('events.weekdayWed'),
    4: t('events.weekdayThu'),
    5: t('events.weekdayFri'),
    6: t('events.weekdaySat'),
    7: t('events.weekdaySun'),
  };

  return (
    <Modal
      opened={open}
      onClose={onClose}
      title={
        splitOccurrenceStart
          ? t('events.editFollowingTitle')
          : series
            ? t('events.editSeries')
            : t('events.newSeries')
      }
      size="md"
    >
      <Stack gap="sm" mt="sm">
        {splitOccurrenceStart && (
          <Alert color="yellow" variant="light">
            {t('events.splitWarning')}
          </Alert>
        )}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        <TextInput
          label={t('events.seriesTitle')}
          value={title}
          onChange={event => setTitle(event.target.value)}
          required
        />
        <Textarea
          label={t('common.description')}
          value={description}
          onChange={event => setDescription(event.target.value)}
          minRows={2}
        />
        <Select
          label={t('events.calendar')}
          data={calendars.map(c => ({ value: c.id, label: c.name }))}
          value={calendarId || null}
          onChange={value => setCalendarId(value ?? '')}
          required
        />
        <TextInput
          label={t('events.start')}
          type="datetime-local"
          value={start}
          onChange={event => setStart(event.target.value)}
          required
        />
        <TextInput
          label={t('events.durationMinutes')}
          type="number"
          value={durationMinutes}
          onChange={event => setDurationMinutes(event.target.value)}
        />
        <TextInput
          label={t('events.timezone')}
          value={timezone}
          onChange={event => setTimezone(event.target.value)}
          placeholder={calendarOrganization?.defaultTimezone || 'UTC'}
          description={t('events.timezoneHint')}
        />
        <Checkbox
          checked={isAllDay}
          onChange={event => setIsAllDay(event.target.checked)}
          label={t('events.allDay')}
        />
        <Checkbox
          checked={isVisible}
          onChange={event => setIsVisible(event.target.checked)}
          label={t('events.visible')}
        />
        <Checkbox
          checked={repeats}
          onChange={event => setRepeats(event.target.checked)}
          label={t('events.repeats')}
        />
        {repeats && (
          <>
            <Select
              label={t('events.frequency')}
              data={[
                { value: 'DAILY', label: t('events.freqDaily') },
                { value: 'WEEKLY', label: t('events.freqWeekly') },
                { value: 'MONTHLY', label: t('events.freqMonthly') },
                { value: 'YEARLY', label: t('events.freqYearly') },
              ]}
              value={freq}
              onChange={value => setFreq((value ?? 'WEEKLY') as RecurrenceFreq)}
            />
            <TextInput
              label={t('events.interval')}
              type="number"
              value={interval}
              onChange={event => setInterval(event.target.value)}
            />
            {(freq === 'WEEKLY' || freq === 'DAILY') && (
              <Group gap="xs" mb={4}>
                {WEEKDAYS.map(day => (
                  <Button
                    key={day}
                    size="xs"
                    variant={weekdays.includes(day) ? 'filled' : 'default'}
                    onClick={() =>
                      setWeekdays(prev =>
                        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
                      )
                    }
                  >
                    {weekdayNames[day]}
                  </Button>
                ))}
              </Group>
            )}
            {freq === 'MONTHLY' && (
              <TextInput
                label={t('events.monthDays')}
                value={monthDays}
                onChange={event => setMonthDays(event.target.value)}
                description={t('events.monthDaysHint')}
              />
            )}
            <TextInput
              label={t('events.until')}
              type="date"
              value={until}
              onChange={event => setUntil(event.target.value)}
            />
            <TextInput
              label={t('events.count')}
              type="number"
              value={count}
              onChange={event => setCount(event.target.value)}
            />
          </>
        )}
      </Stack>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t('common.cancel')}
        </Button>
        <Button variant="filled" disabled={saving} onClick={handleSave}>
          {t('common.save')}
        </Button>
      </Group>
    </Modal>
  );
}

export default EventSeriesDialog;
