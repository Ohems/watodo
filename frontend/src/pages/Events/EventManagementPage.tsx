import { Badge, Select, TextInput } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { eventManagementApi, locationsApi, teamsApi } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import type {
  EventSeriesListQuery,
  EventSeriesManagement,
  Location,
  Team,
} from '../../types/index.js';

function EventManagementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const [data, setData] = useState<EventSeriesManagement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [locationId, setLocationId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [hasTeam, setHasTeam] = useState<boolean | undefined>(undefined);

  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    if (!activeOrganizationId) return;
    locationsApi
      .listAllLocations(activeOrganizationId)
      .then(setLocations)
      .catch(() => setLocations([]));
    teamsApi
      .listTeams(activeOrganizationId, { limit: 200 })
      .then(d => setTeams(d.items))
      .catch(() => setTeams([]));
  }, [activeOrganizationId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query: EventSeriesListQuery = {
        page,
        limit,
        search: search || undefined,
        startFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
        startTo: dateTo ? new Date(dateTo).toISOString() : undefined,
        locationId: locationId ?? undefined,
        teamId: teamId ?? undefined,
        hasTeam,
      };
      const result = await eventManagementApi.listEventSeries(query);
      setData(result.items);
      setTotal(result.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, dateFrom, dateTo, locationId, teamId, hasTeam]);

  useEffect(() => {
    load();
  }, [load]);

  const columns: DataTableColumn<EventSeriesManagement>[] = [
    {
      key: 'title',
      label: t('events.seriesTitle'),
      render: item => <span style={{ fontWeight: 500 }}>{item.title}</span>,
    },
    {
      key: 'start',
      label: t('events.start'),
      render: item => new Date(item.start).toLocaleString(),
    },
    {
      key: 'location',
      label: t('events.location'),
      render: item =>
        item.locationName ? (
          item.locationName
        ) : (
          <span style={{ color: 'var(--mantine-color-gray-5)' }}>{t('events.noLocation')}</span>
        ),
    },
    {
      key: 'teams',
      label: t('events.assignedTeams'),
      render: item =>
        item.teams.length > 0 ? (
          <span>
            {item.teams.map(team => (
              <Badge key={team.id} size="sm" variant="light" mr={4}>
                {team.name}
              </Badge>
            ))}
          </span>
        ) : (
          <span style={{ color: 'var(--mantine-color-gray-5)' }}>{t('events.noTeams')}</span>
        ),
    },
  ];

  return (
    <DataTable
      title={t('nav.eventsManagement')}
      columns={columns}
      data={data}
      total={total}
      page={page}
      limit={limit}
      loading={loading}
      canAdd={canWrite}
      onAdd={() => navigate('/events/new')}
      onPageChange={setPage}
      onLimitChange={setLimit}
      onSearch={setSearch}
      onRowClick={item => navigate(`/events/${item.id}`)}
      extraFilters={
        <>
          <TextInput
            size="sm"
            type="date"
            placeholder={t('events.filterDateFrom')}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ minWidth: 150 }}
          />
          <TextInput
            size="sm"
            type="date"
            placeholder={t('events.filterDateTo')}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ minWidth: 150 }}
          />
          <Select
            size="sm"
            placeholder={t('events.filterByLocation')}
            value={locationId}
            onChange={setLocationId}
            data={locations.map(loc => ({ value: loc.id, label: loc.name }))}
            clearable
            style={{ minWidth: 160 }}
          />
          <Select
            size="sm"
            placeholder={t('events.filterByTeam')}
            value={teamId}
            onChange={setTeamId}
            data={teams.map(team => ({ value: team.id, label: team.name }))}
            clearable
            style={{ minWidth: 160 }}
          />
          <Select
            size="sm"
            placeholder={t('events.filterHasTeam')}
            value={hasTeam === undefined ? null : String(hasTeam)}
            onChange={value => {
              if (value === null) setHasTeam(undefined);
              else setHasTeam(value === 'true');
            }}
            data={[
              { value: 'true', label: t('events.filterHasTeam') },
              { value: 'false', label: t('events.filterNoTeam') },
            ]}
            clearable
            style={{ minWidth: 160 }}
          />
        </>
      }
    />
  );
}

export default EventManagementPage;
