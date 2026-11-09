import { Alert, Box, Center, Group, Loader, Select, Title } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useGetAllRoomsQuery,
  useGetAllSitesQuery,
  useGetCurrentUserQuery,
  useGetOccurrencesQuery,
  useGetTeamsQuery,
} from '../../api/index.js';
import Calendar, { type CalendarEvent } from '../../components/Calendar/Calendar.js';
import { QueryError, QueryState } from '../../components/QueryState/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import {
  selectActiveOrganizationId,
  selectIsOrganizationLoaded,
  selectOrganizationsError,
} from '../../store/organization-slice.js';
import type { EventOccurrence } from '../../types/index.js';
import { occurrenceRef } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

type FilterScope = 'all' | 'team' | 'mine';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function CalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const organizationsLoaded = useAppSelector(selectIsOrganizationLoaded);
  const organizationsError = useAppSelector(selectOrganizationsError);
  const { data: currentUser } = useGetCurrentUserQuery();

  const now = new Date();

  const [range, setRange] = useState(() => ({
    start: startOfMonth(now),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  }));

  const [scope, setScope] = useState<FilterScope>('all');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);

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
  const filtersError = organizationsError || sitesError || roomsError || teamsError;

  // The API is called with a padded range so occurrences just outside the
  // visible month are included. The calendar only shows the active
  // organization's events (the Home page aggregates all organizations).
  const occurrencesQuery = useGetOccurrencesQuery(
    activeOrganizationId
      ? {
          start: new Date(range.start.getTime() - DAY_MS).toISOString(),
          end: new Date(range.end.getTime() + 2 * DAY_MS).toISOString(),
          organizationId: activeOrganizationId,
          filter: {
            scope,
            siteId: siteId ?? undefined,
            roomId: roomId ?? undefined,
            teamId: teamId ?? undefined,
          },
        }
      : skipToken,
  );
  const { isFetching } = occurrencesQuery;
  const occurrences = occurrencesQuery.data ?? [];

  // The API returns cancelled occurrences with a flag; they are hidden here.
  const events: CalendarEvent[] = occurrences
    .filter(occurrence => !occurrence.isCancelled)
    .map(occurrence => ({
      title: occurrence.isRescheduled
        ? `${occurrence.title} (${t('events.rescheduled')})`
        : occurrence.title,
      start: new Date(occurrence.start),
      end: new Date(occurrence.end),
      allDay: occurrence.isAllDay,
      resource: occurrence,
    }));

  const handleEventClick = (event: CalendarEvent) => {
    const occurrence = event.resource as EventOccurrence | undefined;
    if (occurrence) {
      navigate(`/events/occurrences/${encodeURIComponent(occurrenceRef(occurrence))}`);
    }
  };

  // Without an active organization the occurrences query is skipped; show the
  // reason explicitly instead of an empty calendar.
  if (!activeOrganizationId) {
    if (organizationsError) {
      return (
        <Box p="md">
          <QueryError />
        </Box>
      );
    }
    if (organizationsLoaded) {
      return (
        <Box p="md">
          <Alert color="yellow">{t('noOrganization.message')}</Alert>
        </Box>
      );
    }
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Box p="md">
      <Group gap="md" mb="sm" wrap="wrap">
        <Title order={2}>{t('nav.eventsCalendar')}</Title>
        {isFetching && <Loader size="sm" />}
        <Select
          size="sm"
          value={scope}
          onChange={value => setScope((value as FilterScope) ?? 'all')}
          data={[
            { value: 'all', label: t('events.filterAll') },
            { value: 'team', label: t('events.filterTeam') },
            { value: 'mine', label: t('events.filterMine') },
          ]}
          style={{ minWidth: 180 }}
        />
        <Select
          size="sm"
          placeholder={t('events.filterBySite')}
          value={siteId}
          onChange={value => {
            setSiteId(value);
            setRoomId(null);
          }}
          data={sites.map(s => ({ value: s.id, label: s.name }))}
          clearable
          style={{ minWidth: 180 }}
        />
        <Select
          size="sm"
          placeholder={t('events.filterByRoom')}
          value={roomId}
          onChange={setRoomId}
          data={rooms
            .filter(r => !siteId || r.siteId === siteId)
            .map(r => ({ value: r.id, label: r.name }))}
          clearable
          style={{ minWidth: 180 }}
        />
        <Select
          size="sm"
          placeholder={t('events.filterByTeam')}
          value={teamId}
          onChange={setTeamId}
          data={teams.map(team => ({ value: team.id, label: team.name }))}
          clearable
          style={{ minWidth: 180 }}
        />
      </Group>
      {filtersError && <QueryError />}
      <QueryState query={occurrencesQuery}>
        {() => (
          <Calendar
            events={events}
            onRangeChange={newRange => setRange(newRange)}
            onSelectEvent={handleEventClick}
            weekStart={currentUser?.weekStart ?? 'sunday'}
          />
        )}
      </QueryState>
    </Box>
  );
}

export default CalendarPage;
