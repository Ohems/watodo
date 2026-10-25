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
import { skipToken } from '@reduxjs/toolkit/query/react';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useAssignUserToJobMutation,
  useCancelOccurrenceMutation,
  useCreateEventCommentMutation,
  useCreateEventJobMutation,
  useDeleteEventCommentMutation,
  useDeleteEventJobMutation,
  useDeleteExceptionMutation,
  useGetCalendarsQuery,
  useGetCurrentUserQuery,
  useGetMyOrganizationsQuery,
  useGetOccurrenceDetailQuery,
  useGetUserListQuery,
  useRescheduleOccurrenceMutation,
  useUnassignUserFromJobMutation,
  useUpdateEventCommentMutation,
} from '../../api/index.js';
import EventSeriesDialog from '../../components/EventSeriesDialog/EventSeriesDialog.js';
import type { RecurrenceFreq, RecurrenceInput } from '../../types/index.js';

interface EventOccurrenceDialogProps {
  seriesId: number | null;
  occurrenceStart: string | null;
  onClose: () => void;
}

function toLocalInputValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

function EventOccurrenceDialog({ seriesId, occurrenceStart, onClose }: EventOccurrenceDialogProps) {
  const { t } = useTranslation();
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const open = seriesId !== null && occurrenceStart !== null;

  const detailArg =
    open && seriesId !== null && occurrenceStart !== null
      ? { seriesId, occurrenceStart }
      : skipToken;
  const {
    data: detail,
    isLoading: loading,
    error: detailError,
  } = useGetOccurrenceDetailQuery(detailArg);
  const { data: userList = [] } = useGetUserListQuery(open ? undefined : skipToken);

  const [deleteJob] = useDeleteEventJobMutation();
  const [unassignUserFromJob] = useUnassignUserFromJobMutation();
  const [assignUserToJob] = useAssignUserToJobMutation();
  const [createJob] = useCreateEventJobMutation();
  const [updateComment] = useUpdateEventCommentMutation();
  const [deleteComment] = useDeleteEventCommentMutation();
  const [createComment] = useCreateEventCommentMutation();
  const [cancelOccurrence] = useCancelOccurrenceMutation();
  const [deleteException] = useDeleteExceptionMutation();
  const [rescheduleOccurrence] = useRescheduleOccurrenceMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (detailError ? getApiErrorMessage(detailError) : null);

  const [commentBody, setCommentBody] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');

  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [assignUserIds, setAssignUserIds] = useState<Record<number, string>>({});

  const [rescheduleStart, setRescheduleStart] = useState('');

  const [splitOpen, setSplitOpen] = useState(false);
  const { data: calendars = [] } = useGetCalendarsQuery(splitOpen ? undefined : skipToken);
  const { data: organizations = [] } = useGetMyOrganizationsQuery(
    splitOpen ? undefined : skipToken,
  );

  useEffect(() => {
    if (detail) setRescheduleStart(toLocalInputValue(detail.occurrence.start));
  }, [detail]);

  // Mutations invalidate the occurrence detail (and occurrence list) cache
  // tags, so the dialog and the calendar refresh themselves.
  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const openSplitDialog = () => {
    setSplitOpen(true);
  };

  const handleSplitSaved = () => {
    // The occurrence now belongs to the new series, so close this dialog; the
    // split mutation invalidated the occurrence list cache tags.
    setSplitOpen(false);
    onClose();
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
                      onClick={() =>
                        run(() => deleteJob({ seriesId: series.id, jobId: job.id }).unwrap())
                      }
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
                                unassignUserFromJob({
                                  seriesId: series.id,
                                  jobId: job.id,
                                  assignmentId: assignment.id,
                                }).unwrap(),
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
                          await assignUserToJob({
                            seriesId: series.id,
                            jobId: job.id,
                            userId: assignUserIds[job.id],
                          }).unwrap();
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
                      await createJob({
                        seriesId: series.id,
                        data: {
                          title: jobTitle.trim(),
                          description: jobDescription.trim(),
                          occurrenceStart: occurrence.occurrenceStart,
                        },
                      }).unwrap();
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
                          await updateComment({
                            seriesId: series.id,
                            commentId: comment.id,
                            body: editingCommentBody.trim(),
                          }).unwrap();
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
                      onClick={() =>
                        run(() =>
                          deleteComment({ seriesId: series.id, commentId: comment.id }).unwrap(),
                        )
                      }
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
                      await createComment({
                        seriesId: series.id,
                        data: {
                          body: commentBody.trim(),
                          occurrenceStart: occurrence.occurrenceStart,
                        },
                      }).unwrap();
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
                        run(() =>
                          cancelOccurrence({
                            seriesId: series.id,
                            occurrenceStart: occurrence.occurrenceStart,
                          }).unwrap(),
                        )
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
                        run(() =>
                          deleteException({
                            seriesId: series.id,
                            occurrenceStart: occurrence.occurrenceStart,
                          }).unwrap(),
                        )
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
                        rescheduleOccurrence({
                          seriesId: series.id,
                          occurrenceStart: occurrence.occurrenceStart,
                          data: { start: new Date(rescheduleStart).toISOString() },
                        }).unwrap(),
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
