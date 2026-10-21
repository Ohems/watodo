import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarsApi, eventsApi, organizationsApi, usersApi } from '../../api/index.js';
import EventSeriesDialog from '../../components/EventSeriesDialog/EventSeriesDialog.js';
import { useAppSelector } from '../../hooks/redux.js';
import type {
  Calendar,
  EventOccurrenceDetail,
  Organization,
  RecurrenceFreq,
  RecurrenceInput,
  UserListItem,
} from '../../types/index.js';

interface EventOccurrenceDialogProps {
  seriesId: number | null;
  occurrenceStart: string | null;
  onClose: () => void;
  onChanged: () => void;
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function EventOccurrenceDialog({
  seriesId,
  occurrenceStart,
  onClose,
  onChanged,
}: EventOccurrenceDialogProps) {
  const { t } = useTranslation();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const open = seriesId !== null && occurrenceStart !== null;

  const [detail, setDetail] = useState<EventOccurrenceDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userList, setUserList] = useState<UserListItem[]>([]);

  const [commentBody, setCommentBody] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [assignUserIds, setAssignUserIds] = useState<Record<number, string>>({});

  const [rescheduleStart, setRescheduleStart] = useState('');

  const [splitOpen, setSplitOpen] = useState(false);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  const load = useCallback(async () => {
    if (seriesId === null || occurrenceStart === null) return;
    setLoading(true);
    setError(null);
    try {
      const data = await eventsApi.getOccurrenceDetail(seriesId, occurrenceStart);
      setDetail(data);
      setRescheduleStart(toLocalInputValue(data.occurrence.start));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [seriesId, occurrenceStart]);

  useEffect(() => {
    if (open) {
      load();
      usersApi
        .getUserList()
        .then(setUserList)
        .catch(() => setUserList([]));
    }
  }, [open, load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openSplitDialog = async () => {
    try {
      const [calendarsData, organizationsData] = await Promise.all([
        calendarsApi.getCalendars(),
        organizationsApi.getMyOrganizations(),
      ]);
      setCalendars(calendarsData);
      setOrganizations(organizationsData);
    } catch {
      setCalendars([]);
      setOrganizations([]);
    }
    setSplitOpen(true);
  };

  const handleSplitSaved = () => {
    // The occurrence now belongs to the new series, so close this dialog and
    // let the caller reload the calendar.
    setSplitOpen(false);
    onClose();
    onChanged();
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

  const describeRecurrence = (recurrence: RecurrenceInput | null): string => {
    if (!recurrence) return t('events.noRecurrence');
    const freqLabels: Record<RecurrenceFreq, string> = {
      DAILY: t('events.freqDaily'),
      WEEKLY: t('events.freqWeekly'),
      MONTHLY: t('events.freqMonthly'),
      YEARLY: t('events.freqYearly'),
    };
    const interval = recurrence.interval && recurrence.interval > 1 ? recurrence.interval : 1;
    let text =
      interval > 1
        ? t('events.recurrenceEveryN', { interval, freq: freqLabels[recurrence.freq] })
        : freqLabels[recurrence.freq];
    if (recurrence.freq === 'WEEKLY' && recurrence.byWeekdays?.length) {
      text += ` ${t('events.recurrenceOnDays', {
        days: recurrence.byWeekdays.map(day => weekdayNames[day]).join(', '),
      })}`;
    }
    if (recurrence.freq === 'MONTHLY' && recurrence.byMonthDays?.length) {
      text += ` ${t('events.recurrenceOnMonthDays', {
        days: recurrence.byMonthDays.join(', '),
      })}`;
    }
    if (recurrence.until) {
      text += ` ${t('events.recurrenceUntil', { date: new Date(recurrence.until).toLocaleDateString() })}`;
    }
    if (recurrence.count) {
      text += ` ${t('events.recurrenceCount', { count: recurrence.count })}`;
    }
    return text;
  };

  const occurrence = detail?.occurrence;
  const series = detail?.series;

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {occurrence
            ? `${occurrence.title} - ${formatDateTime(occurrence.start)}`
            : t('events.occurrence')}
        </DialogTitle>
        <DialogContent dividers>
          {loading && !detail && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {detail && occurrence && series && (
            <>
              {occurrence.isCancelled && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  {t('events.occurrenceCancelled')}
                </Alert>
              )}
              {occurrence.isRescheduled && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('events.occurrenceRescheduled', {
                    original: formatDateTime(occurrence.occurrenceStart),
                    start: formatDateTime(occurrence.start),
                  })}
                </Alert>
              )}
              {series.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  {series.description}
                </Typography>
              )}
              <Typography variant="body2">
                {t('events.timeRange', {
                  start: formatDateTime(occurrence.start),
                  end: formatDateTime(occurrence.end),
                })}
              </Typography>
              <Typography variant="body2">
                {t('events.timezone')}: {series.timezone}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                {t('events.recurrence')}: {describeRecurrence(series.recurrence)}
              </Typography>

              <Divider sx={{ my: 2 }} />
              <Typography variant="h6">{t('events.jobs')}</Typography>
              {detail.jobs.map(job => (
                <Box key={job.id} sx={{ mt: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="body1">{job.title}</Typography>
                    <Chip
                      size="small"
                      label={
                        job.occurrenceStart
                          ? t('events.occurrenceSpecific')
                          : t('events.seriesWide')
                      }
                    />
                    {canWrite && (
                      <IconButton
                        size="small"
                        aria-label={t('events.deleteJob')}
                        onClick={() => run(() => eventsApi.deleteJob(series.id, job.id))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                  {job.description && (
                    <Typography variant="body2" color="text.secondary">
                      {job.description}
                    </Typography>
                  )}
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
                    {job.assignments.map(assignment => (
                      <Chip
                        key={assignment.id}
                        label={assignment.userName}
                        size="small"
                        onDelete={
                          canWrite
                            ? () =>
                                run(() =>
                                  eventsApi.unassignUserFromJob(series.id, job.id, assignment.id),
                                )
                            : undefined
                        }
                      />
                    ))}
                  </Box>
                  {canWrite && (
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, alignItems: 'center' }}>
                      <TextField
                        select
                        size="small"
                        label={t('events.assignUser')}
                        value={assignUserIds[job.id] ?? ''}
                        onChange={event =>
                          setAssignUserIds(previous => ({
                            ...previous,
                            [job.id]: event.target.value,
                          }))
                        }
                        sx={{ minWidth: 200 }}
                      >
                        {userList
                          .filter(
                            user =>
                              !job.assignments.some(assignment => assignment.userId === user.id),
                          )
                          .map(user => (
                            <MenuItem key={user.id} value={user.id}>
                              {user.name}
                            </MenuItem>
                          ))}
                      </TextField>
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<AddIcon />}
                        disabled={!assignUserIds[job.id]}
                        onClick={() =>
                          run(async () => {
                            await eventsApi.assignUserToJob(
                              series.id,
                              job.id,
                              assignUserIds[job.id],
                            );
                            setAssignUserIds(previous => ({ ...previous, [job.id]: '' }));
                          })
                        }
                      >
                        {t('events.assign')}
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
              {canWrite && (
                <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
                  <TextField
                    size="small"
                    label={t('events.jobTitle')}
                    value={jobTitle}
                    onChange={event => setJobTitle(event.target.value)}
                  />
                  <TextField
                    size="small"
                    label={t('common.description')}
                    value={jobDescription}
                    onChange={event => setJobDescription(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={!jobTitle.trim()}
                    onClick={() =>
                      run(async () => {
                        await eventsApi.createJob(series.id, {
                          title: jobTitle.trim(),
                          description: jobDescription.trim(),
                          occurrenceStart: occurrence.occurrenceStart,
                        });
                        setJobTitle('');
                        setJobDescription('');
                      })
                    }
                  >
                    {t('events.addJob')}
                  </Button>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />
              <Typography variant="h6">{t('events.comments')}</Typography>
              {detail.comments.map(comment => (
                <Box key={comment.id} sx={{ mt: 1 }}>
                  {editingCommentId === comment.id ? (
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <TextField
                        fullWidth
                        size="small"
                        value={editingCommentBody}
                        onChange={event => setEditingCommentBody(event.target.value)}
                      />
                      <Button
                        size="small"
                        variant="contained"
                        disabled={!editingCommentBody.trim()}
                        onClick={() =>
                          run(async () => {
                            await eventsApi.updateComment(
                              series.id,
                              comment.id,
                              editingCommentBody.trim(),
                            );
                            setEditingCommentId(null);
                          })
                        }
                      >
                        {t('common.save')}
                      </Button>
                      <Button size="small" onClick={() => setEditingCommentId(null)}>
                        {t('common.cancel')}
                      </Button>
                    </Box>
                  ) : (
                    <Typography variant="body2">
                      <strong>{comment.userName}</strong> ({formatDateTime(comment.createdAt)}):{' '}
                      {comment.body}
                    </Typography>
                  )}
                  {canWrite && comment.userId === currentUser?.id && (
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        aria-label={t('common.edit')}
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditingCommentBody(comment.body);
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label={t('events.deleteComment')}
                        onClick={() => run(() => eventsApi.deleteComment(series.id, comment.id))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )}
                </Box>
              ))}
              {canWrite && (
                <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('events.addComment')}
                    value={commentBody}
                    onChange={event => setCommentBody(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    disabled={!commentBody.trim()}
                    onClick={() =>
                      run(async () => {
                        await eventsApi.createComment(series.id, {
                          body: commentBody.trim(),
                          occurrenceStart: occurrence.occurrenceStart,
                        });
                        setCommentBody('');
                      })
                    }
                  >
                    {t('events.addComment')}
                  </Button>
                </Box>
              )}

              {canWrite && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="h6">{t('events.occurrenceActions')}</Typography>
                  <Box
                    sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <Button variant="outlined" onClick={openSplitDialog}>
                      {t('events.editFollowing')}
                    </Button>
                    {!occurrence.isCancelled && (
                      <Button
                        color="warning"
                        variant="outlined"
                        onClick={() =>
                          run(() =>
                            eventsApi.cancelOccurrence(series.id, occurrence.occurrenceStart),
                          )
                        }
                      >
                        {t('events.cancelOccurrence')}
                      </Button>
                    )}
                    {occurrence.exceptionId !== null && (
                      <Button
                        color="success"
                        variant="outlined"
                        onClick={() =>
                          run(() =>
                            eventsApi.deleteException(series.id, occurrence.occurrenceStart),
                          )
                        }
                      >
                        {t('events.restoreOccurrence')}
                      </Button>
                    )}
                    <TextField
                      size="small"
                      type="datetime-local"
                      label={t('events.rescheduleTo')}
                      value={rescheduleStart}
                      onChange={event => setRescheduleStart(event.target.value)}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                    <Button
                      variant="outlined"
                      disabled={!rescheduleStart}
                      onClick={() =>
                        run(() =>
                          eventsApi.rescheduleOccurrence(series.id, occurrence.occurrenceStart, {
                            start: new Date(rescheduleStart).toISOString(),
                          }),
                        )
                      }
                    >
                      {t('events.rescheduleOccurrence')}
                    </Button>
                  </Box>
                </>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
      {series && occurrence && (
        <EventSeriesDialog
          open={splitOpen}
          series={series}
          splitOccurrenceStart={occurrence.occurrenceStart}
          calendars={calendars}
          organizations={organizations}
          onClose={() => setSplitOpen(false)}
          onSaved={handleSplitSaved}
        />
      )}
    </>
  );
}

export default EventOccurrenceDialog;
