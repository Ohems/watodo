import { Box, Group, Loader, Select, Title } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { eventsApi, roomsApi, sitesApi, teamsApi } from '../../api/index.js';
import Calendar, { type CalendarEvent } from '../../components/Calendar/Calendar.js';
import EventOccurrenceDialog from '../../components/EventOccurrenceDialog/EventOccurrenceDialog.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { EventOccurrence, Room, Site, Team } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

type FilterScope = 'all' | 'team' | 'mine';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function CalendarPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);

  const now = new Date();

  const [range, setRange] = useState(() => ({
    start: startOfMonth(now),
    end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
  }));
  const [occurrences, setOccurrences] = useState<EventOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<{
    seriesId: number;
    occurrenceStart: string;
  } | null>(null);

  const [scope, setScope] = useState<FilterScope>('all');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    sitesApi
      .listAllSites(activeOrganizationId)
      .then(setSites)
      .catch(() => setSites([]));
    roomsApi
      .listAllRooms(activeOrganizationId)
      .then(setRooms)
      .catch(() => setRooms([]));
    teamsApi
      .listTeams(activeOrganizationId, { limit: 200 })
      .then(data => setTeams(data.items))
      .catch(() => setTeams([]));
  }, [activeOrganizationId]);

  const loadOccurrences = useCallback(
    async (start: Date, end: Date) => {
      setLoading(true);
      try {
        const data = await eventsApi.getOccurrences(
          new Date(start.getTime() - DAY_MS),
          new Date(end.getTime() + 2 * DAY_MS),
          undefined,
          {
            scope,
            siteId: siteId ?? undefined,
            roomId: roomId ?? undefined,
            teamId: teamId ?? undefined,
          },
        );
        setOccurrences(data);
      } catch {
        setOccurrences([]);
      } finally {
        setLoading(false);
      }
    },
    [scope, siteId, roomId, teamId],
  );

  useEffect(() => {
    loadOccurrences(range.start, range.end);
  }, [range, loadOccurrences]);

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
      navigate(`/events/${occurrence.seriesId}`);
    }
  };

  return (
    <Box p="md">
      <Group gap="md" mb="sm" wrap="wrap">
        <Title order={2}>{t('nav.eventsCalendar')}</Title>
        {loading && <Loader size="sm" />}
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
      <Calendar
        events={events}
        onRangeChange={newRange => setRange(newRange)}
        onSelectEvent={handleEventClick}
      />
      <EventOccurrenceDialog
        seriesId={selected?.seriesId ?? null}
        occurrenceStart={selected?.occurrenceStart ?? null}
        onClose={() => setSelected(null)}
        onChanged={() => loadOccurrences(range.start, range.end)}
      />
    </Box>
  );
}

export default CalendarPage;
