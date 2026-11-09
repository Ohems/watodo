import { Badge, Select } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useGetAllRoomsQuery,
  useGetAllSitesQuery,
  useGetCurrentUserQuery,
  useGetEventSeriesManagementListQuery,
  useGetTeamsQuery,
} from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import DateField from '../../components/DateField/index.js';
import { QueryError } from '../../components/QueryState/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { useFormatters } from '../../hooks/use-formatters.js';
import {
  selectActiveOrganizationId,
  selectIsOrganizationLoaded,
  selectOrganizationsError,
} from '../../store/organization-slice.js';
import type { EventSeriesManagement } from '../../types/index.js';

function EventManagementPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const organizationsLoaded = useAppSelector(selectIsOrganizationLoaded);
  const organizationsError = useAppSelector(selectOrganizationsError);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const { formatDateTime } = useFormatters();

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [siteId, setSiteId] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [hasTeam, setHasTeam] = useState<boolean | undefined>(undefined);

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
  const filtersError = sitesError || roomsError || teamsError;

  // The management list only shows the active organization's series (the
  // Home page aggregates all organizations).
  const {
    data,
    isLoading: loading,
    isError,
  } = useGetEventSeriesManagementListQuery(
    activeOrganizationId
      ? {
          page,
          limit,
          search: search || undefined,
          startFrom: dateFrom ? new Date(dateFrom).toISOString() : undefined,
          startTo: dateTo ? new Date(dateTo).toISOString() : undefined,
          siteId: siteId ?? undefined,
          roomId: roomId ?? undefined,
          teamId: teamId ?? undefined,
          hasTeam,
          organizationId: activeOrganizationId,
        }
      : skipToken,
  );

  const locationLabel = (item: EventSeriesManagement): string => {
    if (item.roomName && item.siteName) return `${item.siteName} - ${item.roomName}`;
    if (item.siteName) {
      return item.reserveWholeSite
        ? `${item.siteName} (${t('events.wholeSiteReserved')})`
        : item.siteName;
    }
    return '';
  };

  const columns: DataTableColumn<EventSeriesManagement>[] = [
    {
      key: 'title',
      label: t('events.seriesTitle'),
      render: item => <span style={{ fontWeight: 500 }}>{item.title}</span>,
    },
    {
      key: 'start',
      label: t('events.start'),
      render: item => formatDateTime(item.start),
    },
    {
      key: 'location',
      label: t('events.location'),
      render: item => {
        const label = locationLabel(item);
        return label ? (
          label
        ) : (
          <span style={{ color: 'var(--mantine-color-gray-5)' }}>{t('events.noLocation')}</span>
        );
      },
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
      data={data?.items ?? []}
      total={data?.total ?? 0}
      page={page}
      limit={limit}
      loading={loading || (!activeOrganizationId && !organizationsLoaded)}
      error={isError || organizationsError}
      canAdd={canWrite}
      onAdd={() => navigate('/events/new')}
      onPageChange={setPage}
      onLimitChange={setLimit}
      onSearch={setSearch}
      onRowClick={item => navigate(`/events/${item.id}`)}
      extraFilters={
        <>
          {filtersError && <QueryError />}
          <DateField
            size="sm"
            placeholder={t('events.filterDateFrom')}
            value={dateFrom}
            onChange={setDateFrom}
            style={{ minWidth: 150 }}
          />
          <DateField
            size="sm"
            placeholder={t('events.filterDateTo')}
            value={dateTo}
            onChange={setDateTo}
            style={{ minWidth: 150 }}
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
            style={{ minWidth: 160 }}
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
