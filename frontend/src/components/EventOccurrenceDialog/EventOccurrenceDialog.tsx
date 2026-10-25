import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
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
      <Modal
        opened={open}
        onClose={onClose}
        title={
          occurrence
            ? `${occurrence.title} - ${formatDateTime(occurrence.start)}`
            : t('events.occurrence')
        }
        size="lg"
      >
        {loading && !detail && (
          <Box style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
            <Loader />
          </Box>
        )}
        {error && (
          <Alert color="red" variant="light" mb="sm">
            {error}
          </Alert>
        )}
        {detail && occurrence && series && (
          <Stack gap="sm">
            {occurrence.isCancelled && (
              <Alert color="yellow" variant="light">
                {t('events.occurrenceCancelled')}
              </Alert>
            )}
            {occurrence.isRescheduled && (
              <Alert color="blue" variant="light">
                {t('events.occurrenceRescheduled', {
                  original: formatDateTime(occurrence.occurrenceStart),
                  start: formatDateTime(occurrence.start),
                })}
              </Alert>
            )}
            {series.description && (
              <Text size="sm" c="dimmed">
                {series.description}
              </Text>
            )}
            <Text size="sm">
              {t('events.timeRange', {
                start: formatDateTime(occurrence.start),
                end: formatDateTime(occurrence.end),
              })}
            </Text>
            <Text size="sm">
              {t('events.timezone')}: {series.timezone}
            </Text>
            <Text size="sm" mb="sm">
              {t('events.recurrence')}: {describeRecurrence(series.recurrence)}
            </Text>

            <Divider my="sm" />
            <Title order={5}>{t('events.jobs')}</Title>
            {detail.jobs.map(job => (
              <Box key={job.id} mt="xs">
                <Group gap="xs" wrap="wrap">
                  <Text size="sm" fw={500}>
                    {job.title}
                  </Text>
                  <Badge size="sm" variant="light">
                    {job.occurrenceStart ? t('events.occurrenceSpecific') : t('events.seriesWide')}
                  </Badge>
                  {canWrite && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={t('events.deleteJob')}
                      onClick={() => run(() => eventsApi.deleteJob(series.id, job.id))}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Group>
                {job.description && (
                  <Text size="sm" c="dimmed">
                    {job.description}
                  </Text>
                )}
                <Group gap="xs" mt={4} wrap="wrap">
                  {job.assignments.map(assignment => (
                    <Badge
                      key={assignment.id}
                      size="sm"
                      variant="outline"
                      rightSection={
                        canWrite ? (
                          <ActionIcon
                            size="xs"
                            variant="transparent"
                            onClick={() =>
                              run(() =>
                                eventsApi.unassignUserFromJob(series.id, job.id, assignment.id),
                              )
                            }
                          >
                            <IconTrash size={10} />
                          </ActionIcon>
                        ) : undefined
                      }
                    >
                      {assignment.userName}
                    </Badge>
                  ))}
                </Group>
                {canWrite && (
                  <Group gap="xs" mt={4} wrap="nowrap">
                    <Select
                      size="sm"
                      placeholder={t('events.assignUser')}
                      data={userList
                        .filter(
                          user =>
                            !job.assignments.some(assignment => assignment.userId === user.id),
                        )
                        .map(user => ({ value: user.id, label: user.name }))}
                      value={assignUserIds[job.id] ?? null}
                      onChange={value =>
                        setAssignUserIds(previous => ({
                          ...previous,
                          [job.id]: value ?? '',
                        }))
                      }
                      style={{ minWidth: 200 }}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      leftSection={<IconPlus size={14} />}
                      disabled={!assignUserIds[job.id]}
                      onClick={() =>
                        run(async () => {
                          await eventsApi.assignUserToJob(series.id, job.id, assignUserIds[job.id]);
                          setAssignUserIds(previous => ({ ...previous, [job.id]: '' }));
                        })
                      }
                    >
                      {t('events.assign')}
                    </Button>
                  </Group>
                )}
              </Box>
            ))}
            {canWrite && (
              <Group gap="xs" mt="sm" wrap="wrap">
                <TextInput
                  size="sm"
                  placeholder={t('events.jobTitle')}
                  value={jobTitle}
                  onChange={event => setJobTitle(event.target.value)}
                />
                <TextInput
                  size="sm"
                  placeholder={t('common.description')}
                  value={jobDescription}
                  onChange={event => setJobDescription(event.target.value)}
                />
                <Button
                  variant="filled"
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
              </Group>
            )}

            <Divider my="sm" />
            <Title order={5}>{t('events.comments')}</Title>
            {detail.comments.map(comment => (
              <Box key={comment.id} mt="xs">
                {editingCommentId === comment.id ? (
                  <Group gap="xs">
                    <TextInput
                      size="sm"
                      value={editingCommentBody}
                      onChange={event => setEditingCommentBody(event.target.value)}
                      style={{ flex: 1 }}
                    />
                    <Button
                      size="sm"
                      variant="filled"
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
                    <Button size="sm" variant="subtle" onClick={() => setEditingCommentId(null)}>
                      {t('common.cancel')}
                    </Button>
                  </Group>
                ) : (
                  <Text size="sm">
                    <strong>{comment.userName}</strong> ({formatDateTime(comment.createdAt)}):{' '}
                    {comment.body}
                  </Text>
                )}
                {canWrite && comment.userId === currentUser?.id && (
                  <Group gap={4}>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label={t('common.edit')}
                      onClick={() => {
                        setEditingCommentId(comment.id);
                        setEditingCommentBody(comment.body);
                      }}
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={t('events.deleteComment')}
                      onClick={() => run(() => eventsApi.deleteComment(series.id, comment.id))}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                )}
              </Box>
            ))}
            {canWrite && (
              <Group gap="xs" mt="sm">
                <TextInput
                  size="sm"
                  placeholder={t('events.addComment')}
                  value={commentBody}
                  onChange={event => setCommentBody(event.target.value)}
                  style={{ flex: 1 }}
                />
                <Button
                  variant="filled"
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
              </Group>
            )}

            {canWrite && (
              <>
                <Divider my="sm" />
                <Title order={5}>{t('events.occurrenceActions')}</Title>
                <Group gap="xs" mt="xs" wrap="wrap">
                  <Button variant="outline" onClick={openSplitDialog}>
                    {t('events.editFollowing')}
                  </Button>
                  {!occurrence.isCancelled && (
                    <Button
                      color="yellow"
                      variant="outline"
                      onClick={() =>
                        run(() => eventsApi.cancelOccurrence(series.id, occurrence.occurrenceStart))
                      }
                    >
                      {t('events.cancelOccurrence')}
                    </Button>
                  )}
                  {occurrence.exceptionId !== null && (
                    <Button
                      color="green"
                      variant="outline"
                      onClick={() =>
                        run(() => eventsApi.deleteException(series.id, occurrence.occurrenceStart))
                      }
                    >
                      {t('events.restoreOccurrence')}
                    </Button>
                  )}
                  <TextInput
                    size="sm"
                    type="datetime-local"
                    label={t('events.rescheduleTo')}
                    value={rescheduleStart}
                    onChange={event => setRescheduleStart(event.target.value)}
                  />
                  <Button
                    variant="outline"
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
                </Group>
              </>
            )}
          </Stack>
        )}
        <Group justify="flex-end" mt="md">
          <Button onClick={onClose}>{t('common.close')}</Button>
        </Group>
      </Modal>
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
