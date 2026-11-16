import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { getISOWeek } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  getApiErrorMessage,
  useBulkAssignToWorkRoleMutation,
  useGetAllRoomsQuery,
  useGetAllSitesQuery,
  useGetCurrentUserQuery,
  useGetOccurrenceDetailByRefQuery,
  useGetOccurrencesQuery,
  useGetStaffingWorkloadQuery,
  useGetTeamsQuery,
  useMaterializeOccurrenceMutation,
  useUnassignUserFromOccurrenceWorkRoleMutation,
} from '../../api/index.js';
import { AssignUserModal } from '../../components/AssignUserModal/index.js';
import DateField from '../../components/DateField/index.js';
import { QueryError } from '../../components/QueryState/index.js';
import { SlotAssignees } from '../../components/SlotAssignees/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { useFormatters } from '../../hooks/use-formatters.js';
import { useLocalStorageState } from '../../hooks/use-local-storage-state.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { EventOccurrence, EventWorkRole, StaffingWorkloadItem } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Default workload/overview range: 5 weeks back and 5 weeks forward. */
const DEFAULT_RANGE_WEEKS = 5;

type StaffingView = 'events' | 'unfilled' | 'workload' | 'available';

/** User-configurable staffing page state, persisted to localStorage per organization. */
type StaffingFilters = {
  view: StaffingView;
  dateFrom: string;
  dateTo: string;
  siteId: string | null;
  roomId: string | null;
  teamId: string | null;
  unfilledOnly: boolean;
  criticalOnly: boolean;
};

const STAFFING_FILTERS_KEY = 'watodo_staffing_filters';

function isStaffingFilters(value: unknown): value is StaffingFilters {
  if (typeof value !== 'object' || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    (f.view === 'events' ||
      f.view === 'unfilled' ||
      f.view === 'workload' ||
      f.view === 'available') &&
    typeof f.dateFrom === 'string' &&
    typeof f.dateTo === 'string' &&
    (f.siteId === null || typeof f.siteId === 'string') &&
    (f.roomId === null || typeof f.roomId === 'string') &&
    (f.teamId === null || typeof f.teamId === 'string') &&
    typeof f.unfilledOnly === 'boolean' &&
    typeof f.criticalOnly === 'boolean'
  );
}

function isStaffingFiltersByOrg(value: unknown): value is Record<string, StaffingFilters> {
  return (
    typeof value === 'object' && value !== null && Object.values(value).every(isStaffingFilters)
  );
}

/** Occurrence reference used in URLs and detail queries. */
function occurrenceRefOf(occurrence: EventOccurrence): string {
  return occurrence.occurrenceId !== null
    ? String(occurrence.occurrenceId)
    : `tmp:${occurrence.seriesId}:${occurrence.occurrenceStart}`;
}

/**
 * Expanded staffing panel of one occurrence: its work role slots with
 * assignees and inline assign controls (reusing the occurrence page
 * components), its info slots (read-only here), and a bulk-assign action per
 * slot covering all occurrences of the series in the selected range.
 */
function OccurrenceStaffingPanel({
  occurrence,
  seriesOccurrenceStarts,
  canWrite,
}: {
  occurrence: EventOccurrence;
  /** occurrenceStart values of the same series within the selected range (bulk assign). */
  seriesOccurrenceStarts: string[];
  canWrite: boolean;
}) {
  const { t } = useTranslation();
  const ref = occurrenceRefOf(occurrence);
  const { data: detail, isLoading, isError } = useGetOccurrenceDetailByRefQuery(ref);
  const [materializeOccurrence] = useMaterializeOccurrenceMutation();
  const [unassignUser] = useUnassignUserFromOccurrenceWorkRoleMutation();
  const [bulkAssign, { isLoading: bulkLoading }] = useBulkAssignToWorkRoleMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const ensureOccurrenceId = async (): Promise<number> => {
    if (occurrence.occurrenceId !== null) return occurrence.occurrenceId;
    const res = await materializeOccurrence(ref).unwrap();
    return res.occurrenceId;
  };

  if (isLoading) {
    return (
      <Center p="sm">
        <Loader size="sm" />
      </Center>
    );
  }
  if (isError || !detail) {
    return (
      <Box p="sm">
        <QueryError />
      </Box>
    );
  }

  const slots: EventWorkRole[] =
    detail.occurrence.occurrenceId !== null ? detail.occurrenceWorkRoles : detail.parentWorkRoles;

  const bulkAssignToSeries = (slot: EventWorkRole) => async (userId: string) => {
    const parentSlotId = slot.inheritedFromWorkRoleId ?? slot.id;
    await bulkAssign({
      seriesId: occurrence.seriesId,
      workRoleId: parentSlotId,
      userId,
      occurrenceStarts: seriesOccurrenceStarts,
    }).unwrap();
  };

  return (
    <Stack gap="sm">
      {actionError && (
        <Alert color="red" variant="light">
          {actionError}
        </Alert>
      )}
      {slots.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('events.noRoleRequirements')}
        </Text>
      )}
      {slots.map(slot => (
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
            <Badge
              size="sm"
              variant="light"
              color={slot.assignments.length === 0 ? 'yellow' : 'green'}
            >
              {slot.assignments.length === 0 ? t('events.unfilled') : t('events.filled')}
            </Badge>
            {canWrite && (
              <AssignUserModal
                seriesId={occurrence.seriesId}
                slot={slot}
                start={detail.occurrence.start}
                end={detail.occurrence.end}
                resolveOccurrenceId={ensureOccurrenceId}
                onAssignBulk={bulkAssignToSeries(slot)}
                bulkLoading={bulkLoading}
              />
            )}
          </Group>
          <SlotAssignees
            seriesId={occurrence.seriesId}
            slot={slot}
            start={detail.occurrence.start}
            end={detail.occurrence.end}
            canWrite={canWrite}
            onUnassign={assignmentId =>
              run(() =>
                ensureOccurrenceId().then(occId =>
                  unassignUser({ occurrenceId: occId, workRoleId: slot.id, assignmentId }).unwrap(),
                ),
              )
            }
          />
        </Box>
      ))}
      {detail.infoSlots.length > 0 && (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            {t('events.infoSlots')}
          </Text>
          <Stack gap="xs">
            {detail.infoSlots.map(infoSlot => (
              <Box key={infoSlot.id}>
                <Text size="xs" c="dimmed">
                  {infoSlot.title}
                </Text>
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {infoSlot.value ?? (
                    <span style={{ color: 'var(--mantine-color-gray-5)' }}>-</span>
                  )}
                </Text>
              </Box>
            ))}
          </Stack>
        </Box>
      )}
    </Stack>
  );
}

/**
 * Staffing overview: upcoming occurrences with expandable staffing panels,
 * an unfilled-slots list, a per-user workload matrix and an availability
 * list, all over a shared date/site/room/team filter range.
 */
function StaffingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatDate, formatDateTime } = useFormatters();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const today = new Date();
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  // Default range: 5 weeks to the past and 5 to the future.
  const defaultFrom = isoDay(new Date(today.getTime() - DEFAULT_RANGE_WEEKS * 7 * DAY_MS));
  const defaultTo = isoDay(new Date(today.getTime() + DEFAULT_RANGE_WEEKS * 7 * DAY_MS));

  // The filters persist in localStorage, scoped per organization so that e.g.
  // a site filter of one organization is not applied to another one.
  const filtersOrgKey = activeOrganizationId ?? 'default';
  const [filtersByOrg, setFiltersByOrg] = useLocalStorageState<Record<string, StaffingFilters>>(
    STAFFING_FILTERS_KEY,
    {},
    isStaffingFiltersByOrg,
  );
  const defaultFilters: StaffingFilters = {
    view: 'events',
    dateFrom: defaultFrom,
    dateTo: defaultTo,
    siteId: null,
    roomId: null,
    teamId: null,
    unfilledOnly: false,
    criticalOnly: false,
  };
  const filters = filtersByOrg[filtersOrgKey] ?? defaultFilters;
  const setFilters = (patch: Partial<StaffingFilters>) => {
    setFiltersByOrg(prev => ({
      ...prev,
      [filtersOrgKey]: { ...defaultFilters, ...prev[filtersOrgKey], ...patch },
    }));
  };

  const view = filters.view;
  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const siteId = filters.siteId;
  const roomId = filters.roomId;
  const teamId = filters.teamId;
  const unfilledOnly = filters.unfilledOnly;
  const criticalOnly = filters.criticalOnly;

  // Clearing a date field yields ''; fall back to the default edge (and guard
  // against invalid ranges) instead of constructing Invalid Dates.
  const rangeStart = useMemo(() => {
    const parsed = dateFrom ? new Date(`${dateFrom}T00:00:00.000Z`) : null;
    return parsed && !Number.isNaN(parsed.getTime())
      ? parsed
      : new Date(`${defaultFrom}T00:00:00.000Z`);
  }, [dateFrom, defaultFrom]);
  const rangeEnd = useMemo(() => {
    const parsed = dateTo ? new Date(`${dateTo}T23:59:59.999Z`) : null;
    if (parsed && !Number.isNaN(parsed.getTime()) && parsed > rangeStart) return parsed;
    return new Date(`${defaultTo}T23:59:59.999Z`);
  }, [dateTo, defaultTo, rangeStart]);

  const { data: sites = [], isError: sitesError } = useGetAllSitesQuery(
    activeOrganizationId ?? skipToken,
  );
  const { data: rooms = [], isError: roomsError } = useGetAllRoomsQuery(
    activeOrganizationId ?? skipToken,
  );
  const { data: teamsData, isError: teamsError } = useGetTeamsQuery(
    activeOrganizationId
      ? { organizationId: activeOrganizationId, query: { limit: 200 } }
      : skipToken,
  );
  const teams = teamsData?.items ?? [];

  const occurrencesQuery = useGetOccurrencesQuery(
    activeOrganizationId
      ? {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
          organizationId: activeOrganizationId,
          filter: {
            siteId: siteId ?? undefined,
            roomId: roomId ?? undefined,
            teamId: teamId ?? undefined,
            unfilledOnly: unfilledOnly || undefined,
            criticalOnly: criticalOnly || undefined,
          },
        }
      : skipToken,
  );
  const occurrences = (occurrencesQuery.data ?? []).filter(o => !o.isCancelled);

  const workloadQuery = useGetStaffingWorkloadQuery(
    activeOrganizationId && (view === 'workload' || view === 'available')
      ? {
          organizationId: activeOrganizationId,
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString(),
          siteId: siteId ?? undefined,
          roomId: roomId ?? undefined,
          teamId: teamId ?? undefined,
        }
      : skipToken,
  );
  const workloadItems = workloadQuery.data?.items ?? [];

  const filtersError = sitesError || roomsError || teamsError;

  // Unfilled slots across the listed occurrences, critical first, then date.
  const unfilledSlots = useMemo(
    () =>
      occurrences
        .flatMap(o =>
          o.workRoleSlots.filter(s => s.assigneeCount === 0).map(s => ({ occurrence: o, slot: s })),
        )
        .sort((a, b) => {
          if (a.slot.isCritical !== b.slot.isCritical) return a.slot.isCritical ? -1 : 1;
          return a.occurrence.start.localeCompare(b.occurrence.start);
        }),
    [occurrences],
  );

  // Occurrences grouped by day for the events view.
  const grouped = useMemo(() => {
    const map = new Map<string, EventOccurrence[]>();
    for (const o of occurrences) {
      const day = o.start.slice(0, 10);
      const list = map.get(day) ?? [];
      list.push(o);
      map.set(day, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [occurrences]);

  const seriesStartsBySeries = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const o of occurrences) {
      const list = map.get(o.seriesId) ?? [];
      list.push(o.occurrenceStart);
      map.set(o.seriesId, list);
    }
    return map;
  }, [occurrences]);

  const workloadSorted = useMemo(
    () => [...workloadItems].sort((a, b) => a.assignmentCount - b.assignmentCount),
    [workloadItems],
  );
  const weekStarts = workloadItems[0]?.weeks.map(w => w.start) ?? [];
  const maxWeekCount = Math.max(1, ...workloadItems.flatMap(i => i.weeks.map(w => w.count)));
  const available = workloadItems.filter(i => i.assignmentCount === 0 && !i.hasAbsence);

  const locationLabel = (o: EventOccurrence): string => {
    const site = sites.find(s => s.id === o.siteId)?.name;
    const room = rooms.find(r => r.id === o.roomId)?.name;
    return [site, room].filter(Boolean).join(' - ');
  };

  const renderEvents = () => {
    if (occurrencesQuery.isLoading) {
      return (
        <Center p="xl">
          <Loader />
        </Center>
      );
    }
    if (occurrencesQuery.isError) {
      return (
        <Alert color="red" variant="light">
          <QueryError />
        </Alert>
      );
    }
    if (grouped.length === 0) {
      return (
        <Text c="dimmed" p="md">
          {t('staffing.noOccurrences')}
        </Text>
      );
    }
    return (
      <Stack gap="lg">
        {grouped.map(([day, dayOccurrences]) => (
          <Box key={day}>
            {/* Day label sits on the page background, not inside a card. */}
            <Text size="lg" fw={600} c="dimmed" mb="xs">
              {formatDate(day)}
            </Text>
            <Stack gap="sm">
              {dayOccurrences.map(o => {
                const filled = o.workRoleSlots.filter(s => s.assigneeCount > 0).length;
                const criticalUnfilled = o.workRoleSlots.filter(
                  s => s.isCritical && s.assigneeCount === 0,
                ).length;
                return (
                  <Card key={occurrenceRefOf(o)} shadow="sm" withBorder>
                    <Accordion chevronPosition="left">
                      {/* Single-item accordion per card: drop the item's bottom
                          border (inline style, because the border lives on the
                          item--default variant class) so the card does not show
                          an extra separator line above its own border. */}
                      <Accordion.Item value={occurrenceRefOf(o)} style={{ borderBottom: 'none' }}>
                        <Accordion.Control>
                          <Group gap="sm" wrap="wrap">
                            <Text size="sm" fw={500}>
                              {formatDateTime(o.start)} {o.title}
                            </Text>
                            {locationLabel(o) && (
                              <Text size="xs" c="dimmed">
                                {locationLabel(o)}
                              </Text>
                            )}
                            {o.workRoleSlots.length > 0 && (
                              <Badge
                                size="sm"
                                variant="light"
                                color={
                                  criticalUnfilled > 0
                                    ? 'red'
                                    : filled >= o.workRoleSlots.length
                                      ? 'green'
                                      : 'yellow'
                                }
                              >
                                {t('staffing.filledCount', {
                                  filled,
                                  total: o.workRoleSlots.length,
                                })}
                              </Badge>
                            )}
                            {criticalUnfilled > 0 && (
                              <Badge size="sm" color="red" variant="filled">
                                {t('staffing.criticalUnfilled', { count: criticalUnfilled })}
                              </Badge>
                            )}
                            {(o.infoSlotCount ?? 0) > 0 && (
                              <Badge size="sm" variant="outline" color="gray">
                                {t('staffing.infoSlotsFilled', {
                                  filled: o.filledInfoSlotCount ?? 0,
                                  count: o.infoSlotCount ?? 0,
                                })}
                              </Badge>
                            )}
                          </Group>
                        </Accordion.Control>
                        <Accordion.Panel>
                          <Group justify="flex-end" mb="sm">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() =>
                                navigate(
                                  `/events/occurrences/${encodeURIComponent(occurrenceRefOf(o))}`,
                                )
                              }
                            >
                              {t('staffing.openOccurrence')}
                            </Button>
                          </Group>
                          <OccurrenceStaffingPanel
                            occurrence={o}
                            seriesOccurrenceStarts={
                              seriesStartsBySeries.get(o.seriesId) ?? [o.occurrenceStart]
                            }
                            canWrite={canWrite}
                          />
                        </Accordion.Panel>
                      </Accordion.Item>
                    </Accordion>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        ))}
      </Stack>
    );
  };

  const renderUnfilled = () => {
    if (occurrencesQuery.isLoading) {
      return (
        <Center p="xl">
          <Loader />
        </Center>
      );
    }
    if (occurrencesQuery.isError) {
      return (
        <Alert color="red" variant="light">
          <QueryError />
        </Alert>
      );
    }
    if (unfilledSlots.length === 0) {
      return (
        <Text c="dimmed" p="md">
          {t('staffing.noUnfilled')}
        </Text>
      );
    }
    return (
      <Card shadow="sm" withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('staffing.when')}</Table.Th>
              <Table.Th>{t('staffing.event')}</Table.Th>
              <Table.Th>{t('staffing.slot')}</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {unfilledSlots.map(({ occurrence, slot }) => (
              <Table.Tr key={`${occurrence.seriesId}:${occurrence.occurrenceStart}:${slot.slotId}`}>
                <Table.Td>{formatDateTime(occurrence.start)}</Table.Td>
                <Table.Td>{occurrence.title}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    {slot.workRoleName ?? slot.title}
                    {slot.isCritical && (
                      <Badge size="sm" color="red" variant="filled">
                        {t('events.critical')}
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td style={{ textAlign: 'right' }}>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() =>
                      navigate(
                        `/events/occurrences/${encodeURIComponent(occurrenceRefOf(occurrence))}`,
                      )
                    }
                  >
                    {t('staffing.openOccurrence')}
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    );
  };

  const renderWorkload = () => {
    if (workloadQuery.isLoading) {
      return (
        <Center p="xl">
          <Loader />
        </Center>
      );
    }
    if (workloadQuery.isError) {
      return (
        <Alert color="red" variant="light">
          <QueryError />
        </Alert>
      );
    }
    if (workloadSorted.length === 0) {
      return (
        <Text c="dimmed" p="md">
          {t('staffing.noUsers')}
        </Text>
      );
    }
    return (
      <Card shadow="sm" withBorder>
        {/* Horizontal scroll container: the table has a minimum width based on
            the week columns, so with many weeks it overflows and scrolls here. */}
        <Box style={{ overflowX: 'auto' }}>
          <Table
            striped
            horizontalSpacing="sm"
            withColumnBorders
            miw={320 + weekStarts.length * 72}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('staffing.person')}</Table.Th>
                <Table.Th>{t('staffing.total')}</Table.Th>
                {weekStarts.map(ws => (
                  <Table.Th key={ws} style={{ textAlign: 'center', minWidth: 48 }}>
                    {t('staffing.weekNumber', { week: getISOWeek(new Date(ws)) })}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {workloadSorted.map(item => (
                <Table.Tr key={item.userId}>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Anchor component={RouterLink} to={`/organization/users/${item.userId}`}>
                        {item.name}
                      </Anchor>
                      {item.hasAbsence && (
                        <Badge size="xs" color="yellow" variant="light">
                          {t('staffing.absent')}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td style={{ fontWeight: 600 }}>{item.assignmentCount}</Table.Td>
                  {item.weeks.map(w => (
                    <Table.Td
                      key={w.start}
                      style={{
                        backgroundColor:
                          w.count > 0
                            ? `rgba(250, 82, 82, ${0.08 + 0.5 * (w.count / maxWeekCount)})`
                            : undefined,
                        textAlign: 'center',
                        minWidth: 48,
                      }}
                    >
                      {w.count > 0 ? w.count : ''}
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      </Card>
    );
  };

  const renderAvailable = () => {
    if (workloadQuery.isLoading) {
      return (
        <Center p="xl">
          <Loader />
        </Center>
      );
    }
    if (workloadQuery.isError) {
      return (
        <Alert color="red" variant="light">
          <QueryError />
        </Alert>
      );
    }
    if (available.length === 0) {
      return (
        <Text c="dimmed" p="md">
          {t('staffing.availableEmpty')}
        </Text>
      );
    }
    return (
      <Card shadow="sm" withBorder>
        <Text size="sm" c="dimmed" mb="sm">
          {t('staffing.availableCount', { count: available.length })}
        </Text>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('staffing.person')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {available.map((item: StaffingWorkloadItem) => (
              <Table.Tr key={item.userId}>
                <Table.Td>
                  <Anchor component={RouterLink} to={`/organization/users/${item.userId}`}>
                    {item.name}
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    );
  };

  return (
    <Box p="md" maw={1100} mx="auto">
      <Group justify="space-between" mb="md" wrap="wrap">
        <Title order={3}>{t('staffing.title')}</Title>
        <SegmentedControl
          value={view}
          onChange={value => setFilters({ view: value as StaffingView })}
          data={[
            { value: 'events', label: t('staffing.events') },
            { value: 'unfilled', label: t('staffing.unfilled') },
            { value: 'workload', label: t('staffing.workload') },
            { value: 'available', label: t('staffing.available') },
          ]}
        />
      </Group>

      <Card shadow="sm" withBorder mb="md">
        <Group gap="sm" wrap="wrap" align="flex-end">
          {filtersError && <QueryError />}
          <DateField
            size="sm"
            placeholder={t('events.filterDateFrom')}
            value={dateFrom}
            onChange={value => setFilters({ dateFrom: value })}
            style={{ minWidth: 150 }}
          />
          <DateField
            size="sm"
            placeholder={t('events.filterDateTo')}
            value={dateTo}
            onChange={value => setFilters({ dateTo: value })}
            style={{ minWidth: 150 }}
          />
          <Select
            size="sm"
            placeholder={t('events.filterBySite')}
            value={siteId}
            onChange={value => setFilters({ siteId: value, roomId: null })}
            data={sites.map(s => ({ value: s.id, label: s.name }))}
            clearable
            style={{ minWidth: 160 }}
          />
          <Select
            size="sm"
            placeholder={t('events.filterByRoom')}
            value={roomId}
            onChange={value => setFilters({ roomId: value })}
            data={rooms
              .filter(r => !siteId || r.siteId === siteId)
              .map(r => ({ value: r.id, label: r.name }))}
            clearable
            style={{ minWidth: 160 }}
          />
          <Select
            size="sm"
            placeholder={t('events.filterByTeam')}
            value={teamId}
            onChange={value => setFilters({ teamId: value })}
            data={teams.map(team => ({ value: team.id, label: team.name }))}
            clearable
            style={{ minWidth: 160 }}
          />
          {view === 'events' && (
            <>
              <Switch
                size="sm"
                label={t('staffing.unfilledOnly')}
                checked={unfilledOnly}
                onChange={e => setFilters({ unfilledOnly: e.currentTarget.checked })}
              />
              <Switch
                size="sm"
                label={t('staffing.criticalOnly')}
                checked={criticalOnly}
                onChange={e => setFilters({ criticalOnly: e.currentTarget.checked })}
              />
            </>
          )}
        </Group>
      </Card>

      {view === 'events' && renderEvents()}
      {view === 'unfilled' && renderUnfilled()}
      {view === 'workload' && renderWorkload()}
      {view === 'available' && renderAvailable()}
    </Box>
  );
}

export default StaffingPage;
