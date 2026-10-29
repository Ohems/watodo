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
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useAssignUserToOccurrenceWorkRoleMutation,
  useCreateOccurrenceWorkRoleMutation,
  useDeleteOccurrenceWorkRoleMutation,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetOccurrenceDetailByRefQuery,
  useGetUserListQuery,
  useImportParentSlotsMutation,
  useMaterializeOccurrenceMutation,
  useUnassignUserFromOccurrenceWorkRoleMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { RecurrenceFreq, RecurrenceInput } from '../../types/index.js';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString();
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
  const { data: userList = [] } = useGetUserListQuery(valid ? undefined : skipToken);
  const { data: workRoles = [] } = useGetAllWorkRolesQuery(
    valid && activeOrganizationId ? activeOrganizationId : skipToken,
  );

  const [deleteSlot] = useDeleteOccurrenceWorkRoleMutation();
  const [unassignUser] = useUnassignUserFromOccurrenceWorkRoleMutation();
  const [assignUser] = useAssignUserToOccurrenceWorkRoleMutation();
  const [createSlot] = useCreateOccurrenceWorkRoleMutation();
  const [importParentSlots] = useImportParentSlotsMutation();
  const [materializeOccurrence] = useMaterializeOccurrenceMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (detailError ? getApiErrorMessage(detailError) : null);

  const [slotWorkRoleId, setSlotWorkRoleId] = useState<number | null>(null);
  const [slotIsCritical, setSlotIsCritical] = useState(false);
  const [assignUserIds, setAssignUserIds] = useState<Record<number, string>>({});

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
      occurrenceRef !== null &&
      occurrenceRef.startsWith('tmp:')
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
      text += ` ${t('events.recurrenceUntil', { date: new Date(recurrence.until).toLocaleDateString() })}`;
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
  const slots = occurrence.occurrenceId !== null ? detail.occurrenceJobs : detail.parentJobs;

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

          {/* Import notice: parent has slots not yet on this occurrence */}
          {detail.missingParentJobs.length > 0 && (
            <Alert color="blue" variant="light" mb="sm">
              <Group gap="xs" wrap="wrap" justify="space-between">
                <Text size="sm">
                  {t('events.parentHasNewRoles', {
                    count: detail.missingParentJobs.length,
                  })}{' '}
                  {detail.missingParentJobs.map(j => j.workRoleName ?? j.title).join(', ')}
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
            {slots.map(job => {
              const isUnfilled = job.assignments.length === 0;
              const slotColor = job.isCritical
                ? isUnfilled
                  ? 'red'
                  : 'green'
                : isUnfilled
                  ? 'yellow'
                  : 'green';
              return (
                <Box key={job.id}>
                  <Group gap="xs" wrap="wrap">
                    <Text size="sm" fw={500}>
                      {job.workRoleName ?? job.title}
                    </Text>
                    {job.isCritical && (
                      <Badge size="sm" color="red" variant="filled">
                        {t('events.critical')}
                      </Badge>
                    )}
                    <Badge size="sm" variant="light" color={slotColor}>
                      {isUnfilled
                        ? job.isCritical
                          ? t('events.criticalUnfilled')
                          : t('events.optionalUnfilled')
                        : t('events.filled')}
                    </Badge>
                    {canWrite && (
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={t('events.deleteJob')}
                        onClick={() =>
                          run(() =>
                            ensureOccurrenceId().then(occId =>
                              deleteSlot({ occurrenceId: occId, workRoleId: job.id }).unwrap(),
                            ),
                          )
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
                                  ensureOccurrenceId().then(occId =>
                                    unassignUser({
                                      occurrenceId: occId,
                                      workRoleId: job.id,
                                      assignmentId: assignment.id,
                                    }).unwrap(),
                                  ),
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
                          .filter(user => !job.assignments.some(a => a.userId === user.id))
                          .map(user => ({ value: user.id, label: user.name }))}
                        value={assignUserIds[job.id] ?? null}
                        onChange={value =>
                          setAssignUserIds(prev => ({ ...prev, [job.id]: value ?? '' }))
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
                            const occId = await ensureOccurrenceId();
                            await assignUser({
                              occurrenceId: occId,
                              workRoleId: job.id,
                              userId: assignUserIds[job.id],
                            }).unwrap();
                            setAssignUserIds(prev => ({ ...prev, [job.id]: '' }));
                          })
                        }
                      >
                        {t('events.assign')}
                      </Button>
                    </Group>
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
                  {t('events.addJob')}
                </Button>
              </Group>
            )}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

export default EventOccurrencePage;
