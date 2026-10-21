import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { eventsApi } from '../../api/index.js';
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
  const [saving, setSaving] = useState(false);

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

    setSaving(true);
    try {
      if (splitOccurrenceStart && series) {
        await eventsApi.splitEventSeries(series.id, splitOccurrenceStart, payload);
      } else if (series) {
        await eventsApi.updateEventSeries(series.id, payload);
      } else {
        await eventsApi.createEventSeries(payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
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
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {splitOccurrenceStart
          ? t('events.editFollowingTitle')
          : series
            ? t('events.editSeries')
            : t('events.newSeries')}
      </DialogTitle>
      <DialogContent dividers>
        {splitOccurrenceStart && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {t('events.splitWarning')}
          </Alert>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={t('events.seriesTitle')}
            value={title}
            onChange={event => setTitle(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label={t('common.description')}
            value={description}
            onChange={event => setDescription(event.target.value)}
            multiline
            minRows={2}
            fullWidth
          />
          <TextField
            select
            label={t('events.calendar')}
            value={calendarId}
            onChange={event => setCalendarId(event.target.value)}
            required
            fullWidth
          >
            {calendars.map(calendar => (
              <MenuItem key={calendar.id} value={calendar.id}>
                {calendar.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t('events.start')}
            type="datetime-local"
            value={start}
            onChange={event => setStart(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
            required
            fullWidth
          />
          <TextField
            label={t('events.durationMinutes')}
            type="number"
            value={durationMinutes}
            onChange={event => setDurationMinutes(event.target.value)}
            fullWidth
          />
          <TextField
            label={t('events.timezone')}
            value={timezone}
            onChange={event => setTimezone(event.target.value)}
            placeholder={calendarOrganization?.defaultTimezone || 'UTC'}
            helperText={t('events.timezoneHint')}
            fullWidth
          />
          <FormControlLabel
            control={
              <Checkbox checked={isAllDay} onChange={event => setIsAllDay(event.target.checked)} />
            }
            label={t('events.allDay')}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={isVisible}
                onChange={event => setIsVisible(event.target.checked)}
              />
            }
            label={t('events.visible')}
          />
          <FormControlLabel
            control={
              <Checkbox checked={repeats} onChange={event => setRepeats(event.target.checked)} />
            }
            label={t('events.repeats')}
          />
          {repeats && (
            <>
              <TextField
                select
                label={t('events.frequency')}
                value={freq}
                onChange={event => setFreq(event.target.value as RecurrenceFreq)}
                fullWidth
              >
                <MenuItem value="DAILY">{t('events.freqDaily')}</MenuItem>
                <MenuItem value="WEEKLY">{t('events.freqWeekly')}</MenuItem>
                <MenuItem value="MONTHLY">{t('events.freqMonthly')}</MenuItem>
                <MenuItem value="YEARLY">{t('events.freqYearly')}</MenuItem>
              </TextField>
              <TextField
                label={t('events.interval')}
                type="number"
                value={interval}
                onChange={event => setInterval(event.target.value)}
                fullWidth
              />
              {(freq === 'WEEKLY' || freq === 'DAILY') && (
                <ToggleButtonGroup
                  value={weekdays}
                  onChange={(_event, value: number[]) => setWeekdays(value ?? [])}
                  size="small"
                >
                  {WEEKDAYS.map(day => (
                    <ToggleButton key={day} value={day}>
                      {weekdayNames[day]}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
              {freq === 'MONTHLY' && (
                <TextField
                  label={t('events.monthDays')}
                  value={monthDays}
                  onChange={event => setMonthDays(event.target.value)}
                  helperText={t('events.monthDaysHint')}
                  fullWidth
                />
              )}
              <TextField
                label={t('events.until')}
                type="date"
                value={until}
                onChange={event => setUntil(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
              <TextField
                label={t('events.count')}
                type="number"
                value={count}
                onChange={event => setCount(event.target.value)}
                fullWidth
              />
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="contained" disabled={saving} onClick={handleSave}>
          {t('common.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default EventSeriesDialog;
