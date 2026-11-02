import {
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGetCurrentUserQuery, useGetUserEventAssignmentsQuery } from '../../api/index.js';
import { occurrenceRef, type UserEventAssignment } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 5;

/** Formats a Date as the yyyy-mm-dd value of an <input type="date">. */
function toDateInputValue(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parses an <input type="date"> value into a Date at local midnight. */
function fromDateInputValue(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Card listing the event occurrences a user is assigned to (with the assigned
 * roles), filterable by a date span and paginated. The date span defaults to
 * one month back and forward from today. Rendered only for viewers with
 * events:read (or admin).
 */
function EventAssignmentsCard({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: currentUser } = useGetCurrentUserQuery();
  const canReadEvents =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:read') === true;

  // The date span defaults to one month back and forward from today.
  const [range, setRange] = useState(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()),
      end: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
    };
  });
  const [page, setPage] = useState(0);
  const { data, isLoading } = useGetUserEventAssignmentsQuery(
    canReadEvents
      ? {
          organizationId,
          userId,
          query: {
            start: range.start.toISOString(),
            end: new Date(range.end.getTime() + DAY_MS - 1).toISOString(),
            page,
            limit: PAGE_SIZE,
          },
        }
      : skipToken,
  );
  const assignments = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canReadEvents) return null;

  const setRangeStart = (value: string) => {
    const parsed = fromDateInputValue(value);
    if (!parsed) return;
    setRange(prev => ({ ...prev, start: parsed }));
    setPage(0);
  };
  const setRangeEnd = (value: string) => {
    const parsed = fromDateInputValue(value);
    if (!parsed) return;
    setRange(prev => ({ ...prev, end: parsed }));
    setPage(0);
  };

  return (
    <Paper shadow="sm" p="lg" mb="lg">
      <Title order={4} mb="md">
        {t('orgUsers.eventAssignments')}
      </Title>

      <Group align="flex-end" mb="md" gap="sm">
        <TextInput
          type="date"
          label={t('orgUsers.fromDate')}
          value={toDateInputValue(range.start)}
          onChange={e => setRangeStart(e.currentTarget.value)}
        />
        <TextInput
          type="date"
          label={t('orgUsers.toDate')}
          value={toDateInputValue(range.end)}
          onChange={e => setRangeEnd(e.currentTarget.value)}
        />
      </Group>

      {isLoading ? (
        <Center p="md">
          <Loader size="sm" />
        </Center>
      ) : assignments.length === 0 ? (
        <Text c="dimmed">{t('orgUsers.noEventAssignments')}</Text>
      ) : (
        <Stack gap="xs">
          {assignments.map(a => (
            <EventAssignmentRow
              key={`${a.seriesId}-${a.occurrenceStart}`}
              assignment={a}
              onClick={() =>
                navigate(`/events/occurrences/${encodeURIComponent(occurrenceRef(a))}`)
              }
            />
          ))}
        </Stack>
      )}

      {total > PAGE_SIZE && (
        <Group justify="space-between" mt="md">
          <Button
            variant="default"
            size="xs"
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            {t('common.previous')}
          </Button>
          <Text size="sm" c="dimmed">
            {t('common.page')} {page + 1} {t('common.of')} {pages}
          </Text>
          <Button
            variant="default"
            size="xs"
            disabled={page >= pages - 1}
            onClick={() => setPage(p => p + 1)}
          >
            {t('common.next')}
          </Button>
        </Group>
      )}
    </Paper>
  );
}

/** One row of the event assignments card: event, date and assigned roles. */
function EventAssignmentRow({
  assignment,
  onClick,
}: {
  assignment: UserEventAssignment;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Group
      justify="space-between"
      wrap="wrap"
      style={{
        padding: '8px 12px',
        borderRadius: 4,
        cursor: 'pointer',
        border: '1px solid var(--mantine-color-gray-2)',
      }}
      onClick={onClick}
    >
      <Box>
        <Text size="sm" fw={500}>
          {assignment.title}
        </Text>
        <Text size="xs" c="dimmed">
          {new Date(assignment.start).toLocaleString()}
        </Text>
      </Box>
      <Group gap="xs" wrap="wrap">
        {assignment.roles.map(role => (
          <Badge
            key={role.slotId}
            size="sm"
            variant="light"
            color={role.isCritical ? 'red' : 'blue'}
            title={role.isCritical ? t('orgUsers.criticalRole') : undefined}
          >
            {role.workRoleName ?? role.title}
          </Badge>
        ))}
        {assignment.isRescheduled && (
          <Badge size="sm" variant="light" color="orange">
            {t('events.rescheduled')}
          </Badge>
        )}
        {assignment.isCancelled && (
          <Badge size="sm" variant="light" color="gray">
            {t('events.cancelled')}
          </Badge>
        )}
      </Group>
    </Group>
  );
}

export default EventAssignmentsCard;
