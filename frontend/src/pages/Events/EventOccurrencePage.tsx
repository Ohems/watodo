import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Divider,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { differenceInMinutes } from 'date-fns';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useCreateOccurrenceCommentMutation,
  useCreateOccurrenceWorkRoleMutation,
  useDeleteOccurrenceCommentMutation,
  useDeleteOccurrenceWorkRoleMutation,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetOccurrenceDetailByRefQuery,
  useImportParentInfoSlotsMutation,
  useImportParentSlotsMutation,
  useMaterializeOccurrenceMutation,
  useUnassignUserFromOccurrenceWorkRoleMutation,
  useUpdateOccurrenceCommentMutation,
  useUpdateOccurrenceInfoSlotMutation,
  useUpdateOccurrenceWorkRoleMutation,
} from '../../api/index.js';
import { AssignUserDropdown } from '../../components/AssignUserDropdown/index.js';
import { BookingConflictsAlert } from '../../components/BookingConflictsAlert/index.js';
import { QueryError } from '../../components/QueryState/index.js';
import { SlotAssignees } from '../../components/SlotAssignees/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { useFormatters } from '../../hooks/use-formatters.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type {
  BookingConflict,
  EventComment,
  RecurrenceFreq,
  RecurrenceInput,
} from '../../types/index.js';

/**
 * A comment counts as "edited" only when it was modified more than this many
 * minutes after its creation (bumps within the threshold are not shown).
 */
const EDITED_MARKER_THRESHOLD_MINUTES = 5;

/** Whether a comment was edited long enough after creation to show a marker. */
function isEditedComment(comment: EventComment): boolean {
  return (
    differenceInMinutes(new Date(comment.updatedAt), new Date(comment.createdAt)) >
    EDITED_MARKER_THRESHOLD_MINUTES
  );
}

/**
 * Full-page view of a single event instance (one occurrence of a series).
 * Opened by clicking an event on the calendar or in the Home "Upcoming
 * events" widget. The "Work roles" card manages the occurrence's work role
 * slots (inherited from the parent series on materialization) and their
 * assignees.
 */
function EventOccurrencePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatDate, formatDateTime } = useFormatters();
  const { occurrenceRef: occurrenceRefParam } = useParams<{ occurrenceRef: string }>();

  const occurrenceRef = occurrenceRefParam ? decodeURIComponent(occurrenceRefParam) : null;
  const valid = occurrenceRef !== null && occurrenceRef.length > 0;

  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);

  const {
    data: detail,
    isLoading: loading,
    error: detailError,
  } = useGetOccurrenceDetailByRefQuery(valid ? (occurrenceRef as string) : skipToken);
  // Work roles are organization-scoped: always offer the ones of the
  // organization that owns this event, not of the currently active one.
  const eventOrganizationId = detail?.occurrence.organizationId ?? activeOrganizationId;
  const { data: workRoles = [], isError: workRolesError } = useGetAllWorkRolesQuery(
    valid && eventOrganizationId ? eventOrganizationId : skipToken,
  );

  const [deleteSlot] = useDeleteOccurrenceWorkRoleMutation();
  const [updateSlot] = useUpdateOccurrenceWorkRoleMutation();
  const [unassignUser] = useUnassignUserFromOccurrenceWorkRoleMutation();
  const [createSlot] = useCreateOccurrenceWorkRoleMutation();
  const [importParentSlots] = useImportParentSlotsMutation();
  const [importParentInfoSlots] = useImportParentInfoSlotsMutation();
  const [materializeOccurrence] = useMaterializeOccurrenceMutation();
  const [createComment] = useCreateOccurrenceCommentMutation();
  const [updateComment] = useUpdateOccurrenceCommentMutation();
  const [deleteComment] = useDeleteOccurrenceCommentMutation();
  const [updateInfoSlot] = useUpdateOccurrenceInfoSlotMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  // Booking conflicts reported when this occurrence was materialized.
  const [conflicts, setConflicts] = useState<BookingConflict[] | undefined>(undefined);
  const error = actionError ?? (detailError ? getApiErrorMessage(detailError) : null);

  const [slotWorkRoleId, setSlotWorkRoleId] = useState<number | null>(null);
  const [slotIsCritical, setSlotIsCritical] = useState(false);
  const [editingDescriptionId, setEditingDescriptionId] = useState<number | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState('');
  // Comment draft + inline edit state.
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState('');
  // Info slot value drafts keyed by slot ID.
  const [infoSlotDrafts, setInfoSlotDrafts] = useState<Record<number, string>>({});

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  /**
   * Returns the numeric occurrence ID, materializing the occurrence first
   * when the URL still has a tmp ref. After materialization the URL is
   * upgraded to the numeric ID.
   */
  const ensureOccurrenceId = async (): Promise<number> => {
    if (occurrenceRef !== null && !/^\d+$/.test(occurrenceRef)) {
      const res = await materializeOccurrence(occurrenceRef).unwrap();
      setConflicts(res.conflicts);
      navigate(`/events/occurrences/${res.occurrenceId}`, { replace: true });
      return res.occurrenceId;
    }
    return Number(occurrenceRef);
  };

  // Upgrade the URL from a tmp ref to the stable numeric ID once the
  // occurrence is materialized (e.g. after the first write).
  useEffect(() => {
    if (
      detail?.occurrence.occurrenceId !== null &&
      detail?.occurrence.occurrenceId !== undefined &&
      occurrenceRef?.startsWith('tmp:')
    ) {
      navigate(`/events/occurrences/${detail.occurrence.occurrenceId}`, { replace: true });
    }
  }, [detail, occurrenceRef, navigate]);

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
      text += ` ${t('events.recurrenceUntil', { date: formatDate(recurrence.until) })}`;
    }
    if (recurrence.count) {
      text += ` ${t('events.recurrenceCount', { count: recurrence.count })}`;
    }
    return text;
  };

  if (!valid) {
    return (
      <Box p="md">
        <Alert color="red">Invalid event occurrence</Alert>
      </Box>
    );
  }

  if (loading && !detail) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  const occurrence = detail?.occurrence;
  const series = detail?.series;

  if (!detail || !occurrence || !series) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Event occurrence not found'}</Alert>
      </Box>
    );
  }

  // Slots to show: occurrence-level slots once materialized, otherwise the
  // parent (series-level) slots.
  const slots =
    occurrence.occurrenceId !== null ? detail.occurrenceWorkRoles : detail.parentWorkRoles;
  // Info slots follow the same rule: the occurrence-level (inherited) copies
  // once materialized, otherwise the parent template.
  const infoSlots =
    occurrence.occurrenceId !== null ? detail.occurrenceInfoSlots : detail.parentInfoSlots;

  return (
    <Box p="md" maw={900} mx="auto">
      <Group justify="space-between" mb="md">
        <Title order={3}>
          {occurrence.title} - {formatDateTime(occurrence.start)}
        </Title>
        <Button variant="subtle" onClick={() => navigate('/events/calendar')}>
          {t('events.backToList')}
        </Button>
      </Group>

      {error && (
        <Alert color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}

      <Box mb="md">
        <BookingConflictsAlert conflicts={conflicts} />
      </Box>

      <Stack gap="md">
        <Card shadow="sm" withBorder>
          <Stack gap="xs">
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
            <Text size="sm">
              {t('events.recurrence')}: {describeRecurrence(series.recurrence)}
            </Text>
            <Text size="sm" c="dimmed">
              {t('events.organization')}: {occurrence.organizationName}
            </Text>
          </Stack>
        </Card>

        {/* Readiness section */}
        {detail.readiness && detail.readiness.roles.length > 0 && (
          <Card shadow="sm" withBorder>
            <Group gap="xs" wrap="wrap" align="center" mb="xs">
              <Title order={5}>{t('events.readiness')}</Title>
              {detail.readiness.isReady ? (
                <Badge color="green" variant="filled" size="sm">
                  {t('events.ready')}
                </Badge>
              ) : (
                <Badge color="red" variant="filled" size="sm">
                  {t('events.notReady')}
                </Badge>
              )}
            </Group>
            {!detail.readiness.isReady && (
              <Alert color="red" variant="light" mb="sm">
                {t('events.unfilledCriticalRoles', {
                  count: detail.readiness.unfilledCriticalCount,
                })}
              </Alert>
            )}
            <Stack gap={4}>
              {detail.readiness.roles.map(role => (
                <Group key={role.workRoleId ?? role.workRoleName} gap="xs" wrap="wrap">
                  <Text size="sm" fw={500}>
                    {role.workRoleName}
                  </Text>
                  <Badge size="sm" variant="light" color={role.isCritical ? 'red' : 'gray'}>
                    {role.isCritical ? t('events.critical') : t('events.optional')}
                  </Badge>
                  <Badge
                    size="sm"
                    variant="outline"
                    color={
                      role.isUnfilled ? 'red' : role.filled >= role.required ? 'green' : 'yellow'
                    }
                  >
                    {t('events.filledCount', { filled: role.filled, required: role.required })}
                  </Badge>
                </Group>
              ))}
            </Stack>
          </Card>
        )}

        {/* Work roles card: slots for this instance + assignees */}
        <Card shadow="sm" withBorder>
          <Title order={5} mb="xs">
            {t('events.workRoles')}
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            {t('events.instanceWorkRoles')}
          </Text>

          {workRolesError && (
            <Box mb="sm">
              <QueryError />
            </Box>
          )}

          {/* Import notice: parent has slots not yet on this occurrence */}
          {detail.missingParentWorkRoles.length > 0 && (
            <Alert color="blue" variant="light" mb="sm">
              <Group gap="xs" wrap="wrap" justify="space-between">
                <Text size="sm">
                  {t('events.parentHasNewRoles', {
                    count: detail.missingParentWorkRoles.length,
                  })}{' '}
                  {detail.missingParentWorkRoles.map(j => j.workRoleName ?? j.title).join(', ')}
                </Text>
                {canWrite && occurrence.occurrenceId !== null && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => run(() => importParentSlots(occurrenceRef as string).unwrap())}
                  >
                    {t('events.importFromParent')}
                  </Button>
                )}
              </Group>
            </Alert>
          )}

          <Stack gap="sm">
            {slots.map(slot => {
              const isUnfilled = slot.assignments.length === 0;
              const slotColor = slot.isCritical
                ? isUnfilled
                  ? 'red'
                  : 'green'
                : isUnfilled
                  ? 'yellow'
                  : 'green';
              return (
                <Box key={slot.id}>
                  <Group gap="xs" wrap="wrap">
                    <Text size="sm" fw={500}>
                      {slot.workRoleName ?? slot.title}
                    </Text>
                    {slot.isCritical && (
                      <Badge size="sm" color="red" variant="filled">
                        {t('events.critical')}
                      </Badge>
                    )}
                    <Badge size="sm" variant="light" color={slotColor}>
                      {isUnfilled ? t('events.unfilled') : t('events.filled')}
                    </Badge>
                    {canWrite && (
                      <>
                        <Divider orientation="vertical" />
                        <Switch
                          size="xs"
                          label={t('events.criticalRole')}
                          checked={slot.isCritical}
                          onChange={() =>
                            run(() =>
                              ensureOccurrenceId().then(occId =>
                                updateSlot({
                                  occurrenceId: occId,
                                  workRoleId: slot.id,
                                  data: { isCritical: !slot.isCritical },
                                }).unwrap(),
                              ),
                            )
                          }
                        />
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          aria-label={t('events.deleteSlot')}
                          onClick={() =>
                            run(() =>
                              ensureOccurrenceId().then(occId =>
                                deleteSlot({ occurrenceId: occId, workRoleId: slot.id }).unwrap(),
                              ),
                            )
                          }
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </>
                    )}
                  </Group>
                  {editingDescriptionId === slot.id ? (
                    <Group gap="xs" mt={4} wrap="wrap">
                      <Textarea
                        size="xs"
                        value={descriptionDraft}
                        onChange={event => setDescriptionDraft(event.currentTarget.value)}
                        placeholder={t('events.slotDescriptionPlaceholder')}
                        autosize
                        minRows={1}
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <Button
                        size="xs"
                        aria-label={t('events.saveSlotDescription')}
                        onClick={() =>
                          run(async () => {
                            const occId = await ensureOccurrenceId();
                            await updateSlot({
                              occurrenceId: occId,
                              workRoleId: slot.id,
                              data: { description: descriptionDraft },
                            }).unwrap();
                            setEditingDescriptionId(null);
                          })
                        }
                      >
                        {t('save')}
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        onClick={() => setEditingDescriptionId(null)}
                      >
                        {t('cancel')}
                      </Button>
                    </Group>
                  ) : (
                    <Group gap={4} mt={4} wrap="nowrap">
                      {slot.description && (
                        <Text size="sm" c="dimmed">
                          {slot.description}
                        </Text>
                      )}
                      {canWrite && (
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          aria-label={t('events.editDescription')}
                          onClick={() => {
                            setEditingDescriptionId(slot.id);
                            setDescriptionDraft(slot.description);
                          }}
                        >
                          <IconPencil size={14} />
                        </ActionIcon>
                      )}
                    </Group>
                  )}
                  {/* People list: assignees with the same fitness badges as the dropdown. */}
                  <SlotAssignees
                    seriesId={series.id}
                    slot={slot}
                    start={occurrence.start}
                    end={occurrence.end}
                    canWrite={canWrite}
                    onUnassign={assignmentId =>
                      run(() =>
                        ensureOccurrenceId().then(occId =>
                          unassignUser({
                            occurrenceId: occId,
                            workRoleId: slot.id,
                            assignmentId,
                          }).unwrap(),
                        ),
                      )
                    }
                  />
                  {canWrite && (
                    <AssignUserDropdown
                      seriesId={series.id}
                      slot={slot}
                      start={occurrence.start}
                      end={occurrence.end}
                      resolveOccurrenceId={ensureOccurrenceId}
                    />
                  )}
                  <Divider my="xs" />
                </Box>
              );
            })}
            {slots.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('events.noRoleRequirements')}
              </Text>
            )}
            {canWrite && (
              <Group gap="xs" wrap="wrap">
                <Select
                  size="sm"
                  placeholder={t('events.selectWorkRole')}
                  data={workRoles.map(wr => ({ value: String(wr.id), label: wr.name }))}
                  value={slotWorkRoleId !== null ? String(slotWorkRoleId) : null}
                  onChange={value => setSlotWorkRoleId(value ? Number.parseInt(value, 10) : null)}
                  clearable
                  style={{ minWidth: 180 }}
                />
                <Switch
                  size="sm"
                  label={t('events.criticalRole')}
                  checked={slotIsCritical}
                  onChange={event => setSlotIsCritical(event.currentTarget.checked)}
                />
                <Button
                  variant="filled"
                  disabled={slotWorkRoleId === null}
                  onClick={() =>
                    run(async () => {
                      if (slotWorkRoleId === null) return;
                      const wr = workRoles.find(w => w.id === slotWorkRoleId);
                      const occId = await ensureOccurrenceId();
                      await createSlot({
                        occurrenceId: occId,
                        data: {
                          title: wr?.name ?? 'Slot',
                          isCritical: slotIsCritical,
                          workRoleId: slotWorkRoleId,
                        },
                      }).unwrap();
                      setSlotWorkRoleId(null);
                      setSlotIsCritical(false);
                    })
                  }
                >
                  {t('events.addSlot')}
                </Button>
              </Group>
            )}
          </Stack>
        </Card>

        {/* Info slots card: form-like text fields inherited from the series */}
        <Card shadow="sm" withBorder>
          <Title order={5} mb="xs">
            {t('events.infoSlots')}
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            {t('events.instanceInfoSlots')}
          </Text>

          {detail.missingParentInfoSlots.length > 0 && (
            <Alert color="blue" variant="light" mb="sm">
              <Group gap="xs" wrap="wrap" justify="space-between">
                <Text size="sm">
                  {t('events.parentHasNewInfoSlots', {
                    count: detail.missingParentInfoSlots.length,
                  })}{' '}
                  {detail.missingParentInfoSlots.map(s => s.title).join(', ')}
                </Text>
                {canWrite && occurrence.occurrenceId !== null && (
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      run(() => importParentInfoSlots(occurrenceRef as string).unwrap())
                    }
                  >
                    {t('events.importInfoSlotsFromParent')}
                  </Button>
                )}
              </Group>
            </Alert>
          )}

          <Stack gap="sm">
            {infoSlots.map(infoSlot => (
              <Box key={infoSlot.id}>
                <Text size="sm" fw={500}>
                  {infoSlot.title}
                </Text>
                {infoSlot.description && (
                  <Text size="xs" c="dimmed">
                    {infoSlot.description}
                  </Text>
                )}
                {canWrite ? (
                  <>
                    <Textarea
                      size="xs"
                      mt={4}
                      autosize
                      minRows={3}
                      value={infoSlotDrafts[infoSlot.id] ?? infoSlot.value ?? ''}
                      onChange={event => {
                        // Read the value eagerly: inside a functional setState
                        // updater `event.currentTarget` is already null when
                        // React invokes the updater during the next render.
                        const next = event.currentTarget.value;
                        setInfoSlotDrafts(drafts => ({ ...drafts, [infoSlot.id]: next }));
                      }}
                      placeholder={t('events.infoSlotValuePlaceholder')}
                    />
                    <Button
                      size="xs"
                      mt={4}
                      aria-label={t('events.saveInfoSlotValue')}
                      onClick={() =>
                        run(async () => {
                          const occId = await ensureOccurrenceId();
                          const value = infoSlotDrafts[infoSlot.id] ?? infoSlot.value ?? '';
                          await updateInfoSlot({
                            occurrenceId: occId,
                            infoSlotId: infoSlot.id,
                            value: value.trim() === '' ? null : value,
                          }).unwrap();
                        })
                      }
                    >
                      {t('save')}
                    </Button>
                  </>
                ) : (
                  <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                    {infoSlot.value ?? (
                      <span style={{ color: 'var(--mantine-color-gray-5)' }}>-</span>
                    )}
                  </Text>
                )}
                <Divider my="xs" />
              </Box>
            ))}
            {infoSlots.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('events.noInfoSlots')}
              </Text>
            )}
          </Stack>
        </Card>

        {/* Comments card: occurrence-scoped plus series-wide comments */}
        <Card shadow="sm" withBorder>
          <Title order={5} mb="xs">
            {t('events.comments')}
          </Title>
          <Stack gap="sm">
            {detail.comments.map(comment => (
              <Box key={comment.id}>
                <Group gap="xs" wrap="wrap">
                  <Text size="sm" fw={500}>
                    {comment.userName}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {formatDateTime(comment.createdAt)}
                  </Text>
                  {isEditedComment(comment) && (
                    <Text size="xs" c="dimmed" fs="italic">
                      {t('events.commentEdited', { date: formatDateTime(comment.updatedAt) })}
                    </Text>
                  )}
                  {canWrite && comment.userId === currentUser?.id && (
                    <>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={t('events.editComment')}
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setCommentEditDraft(comment.body);
                        }}
                      >
                        <IconPencil size={14} />
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={t('events.deleteComment')}
                        onClick={() =>
                          run(async () => {
                            const occId = await ensureOccurrenceId();
                            await deleteComment({
                              occurrenceId: occId,
                              commentId: comment.id,
                            }).unwrap();
                          })
                        }
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </>
                  )}
                </Group>
                {editingCommentId === comment.id ? (
                  <>
                    <Textarea
                      size="xs"
                      mt={4}
                      autosize
                      minRows={1}
                      value={commentEditDraft}
                      onChange={event => setCommentEditDraft(event.currentTarget.value)}
                      placeholder={t('events.commentPlaceholder')}
                    />
                    <Group gap="xs" mt={4}>
                      <Button
                        size="xs"
                        aria-label={t('events.saveCommentEdit')}
                        disabled={commentEditDraft.trim() === ''}
                        onClick={() =>
                          run(async () => {
                            const occId = await ensureOccurrenceId();
                            await updateComment({
                              occurrenceId: occId,
                              commentId: comment.id,
                              body: commentEditDraft.trim(),
                            }).unwrap();
                            setEditingCommentId(null);
                          })
                        }
                      >
                        {t('save')}
                      </Button>
                      <Button size="xs" variant="subtle" onClick={() => setEditingCommentId(null)}>
                        {t('cancel')}
                      </Button>
                    </Group>
                  </>
                ) : (
                  <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                    {comment.body}
                  </Text>
                )}
                <Divider my="xs" />
              </Box>
            ))}
            {detail.comments.length === 0 && (
              <Text size="sm" c="dimmed">
                {t('events.noComments')}
              </Text>
            )}
            {canWrite && (
              <>
                <Textarea
                  size="sm"
                  autosize
                  minRows={2}
                  value={commentDraft}
                  onChange={event => setCommentDraft(event.currentTarget.value)}
                  placeholder={t('events.commentPlaceholder')}
                />
                <Button
                  size="xs"
                  disabled={commentDraft.trim() === ''}
                  onClick={() =>
                    run(async () => {
                      const occId = await ensureOccurrenceId();
                      await createComment({
                        occurrenceId: occId,
                        body: commentDraft.trim(),
                      }).unwrap();
                      setCommentDraft('');
                    })
                  }
                >
                  {t('events.addComment')}
                </Button>
              </>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

export default EventOccurrencePage;
