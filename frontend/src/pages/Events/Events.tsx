import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarsApi, eventsApi, organizationsApi } from '../../api/index.js';
import EventSeriesDialog from '../../components/EventSeriesDialog/EventSeriesDialog.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Calendar, EventSeries, Organization, RecurrenceInput } from '../../types/index.js';

function Events() {
  const { t } = useTranslation();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const [series, setSeries] = useState<EventSeries[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<EventSeries | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventSeries | null>(null);

  const [newCalendarName, setNewCalendarName] = useState('');
  const [newCalendarOrganizationId, setNewCalendarOrganizationId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [seriesData, calendarsData, organizationsData] = await Promise.all([
        eventsApi.getEventSeries(),
        calendarsApi.getCalendars(),
        organizationsApi.getMyOrganizations(),
      ]);
      setSeries(seriesData);
      setCalendars(calendarsData);
      setOrganizations(organizationsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const calendarName = (calendarId: string) =>
    calendars.find(calendar => calendar.id === calendarId)?.name ?? calendarId;

  const describeRecurrence = (recurrence: RecurrenceInput | null): string => {
    if (!recurrence) return t('events.noRecurrence');
    const freqLabels: Record<string, string> = {
      DAILY: t('events.freqDaily'),
      WEEKLY: t('events.freqWeekly'),
      MONTHLY: t('events.freqMonthly'),
      YEARLY: t('events.freqYearly'),
    };
    let text = freqLabels[recurrence.freq] ?? recurrence.freq;
    if (recurrence.interval && recurrence.interval > 1) {
      text = `${recurrence.interval}x ${text}`;
    }
    return text;
  };

  const handleCreateCalendar = async () => {
    setError(null);
    try {
      await calendarsApi.createCalendar({
        name: newCalendarName.trim(),
        organizationId: newCalendarOrganizationId,
      });
      setNewCalendarName('');
      setNewCalendarOrganizationId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await eventsApi.deleteEventSeries(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Typography variant="h4">{t('events.title')}</Typography>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            disabled={calendars.length === 0}
            onClick={() => {
              setEditingSeries(null);
              setDialogOpen(true);
            }}
          >
            {t('events.newSeries')}
          </Button>
        )}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      {calendars.length === 0 && canWrite && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">{t('events.createCalendar')}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label={t('events.calendarName')}
              value={newCalendarName}
              onChange={event => setNewCalendarName(event.target.value)}
            />
            <TextField
              select
              size="small"
              label={t('events.organization')}
              value={newCalendarOrganizationId}
              onChange={event => setNewCalendarOrganizationId(event.target.value)}
              sx={{ minWidth: 200 }}
            >
              {organizations.map(organization => (
                <MenuItem key={organization.id} value={organization.id}>
                  {organization.name}
                </MenuItem>
              ))}
            </TextField>
            <Button
              variant="outlined"
              disabled={!newCalendarName.trim() || !newCalendarOrganizationId}
              onClick={handleCreateCalendar}
            >
              {t('events.createCalendar')}
            </Button>
          </Box>
        </Paper>
      )}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('events.seriesTitle')}</TableCell>
              <TableCell>{t('events.calendar')}</TableCell>
              <TableCell>{t('events.start')}</TableCell>
              <TableCell>{t('events.durationMinutes')}</TableCell>
              <TableCell>{t('events.recurrence')}</TableCell>
              {canWrite && <TableCell align="right">{t('events.actions')}</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {series.map(row => (
              <TableRow key={row.id}>
                <TableCell>{row.title}</TableCell>
                <TableCell>{calendarName(row.calendarId)}</TableCell>
                <TableCell>{new Date(row.start).toLocaleString()}</TableCell>
                <TableCell>{row.durationMinutes}</TableCell>
                <TableCell>{describeRecurrence(row.recurrence)}</TableCell>
                {canWrite && (
                  <TableCell align="right">
                    <IconButton
                      aria-label={t('common.edit')}
                      onClick={() => {
                        setEditingSeries(row);
                        setDialogOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      aria-label={t('events.deleteSeries')}
                      onClick={() => setDeleteTarget(row)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                )}
              </TableRow>
            ))}
            {series.length === 0 && (
              <TableRow>
                <TableCell colSpan={canWrite ? 6 : 5} align="center">
                  {t('events.noSeries')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <EventSeriesDialog
        open={dialogOpen}
        series={editingSeries}
        calendars={calendars}
        organizations={organizations}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
      <Dialog open={deleteTarget !== null} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>{t('events.deleteSeries')}</DialogTitle>
        <DialogContent>
          {t('events.deleteSeriesConfirm', { title: deleteTarget?.title ?? '' })}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            {t('events.deleteSeries')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Events;
