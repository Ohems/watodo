import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useGetAllRoomsQuery,
  useGetAllSitesQuery,
  useGetCurrentUserQuery,
  useGetEventSeriesManagementQuery,
  useGetTeamsQuery,
  useUpdateEventSeriesConfigMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function EventConfigPage() {
  const { t } = useTranslation();
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const seriesId = Number.parseInt(eventId ?? '', 10);
  const validId = !Number.isNaN(seriesId);

  const {
    data: series,
    isLoading: loading,
    error: seriesError,
  } = useGetEventSeriesManagementQuery(validId ? seriesId : skipToken);
  const { data: sites = [] } = useGetAllSitesQuery(activeOrganizationId ?? skipToken);
  const { data: rooms = [] } = useGetAllRoomsQuery(activeOrganizationId ?? skipToken);
  const { data: teamsData } = useGetTeamsQuery(
    activeOrganizationId
      ? { organizationId: activeOrganizationId, query: { limit: 200 } }
      : skipToken,
  );
  const teams = teamsData?.items ?? [];
  const [updateConfig, { isLoading: saving }] = useUpdateEventSeriesConfigMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (seriesError ? getApiErrorMessage(seriesError) : null);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [reserveWholeSite, setReserveWholeSite] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  useEffect(() => {
    if (series) {
      setSelectedSiteId(series.siteId);
      setSelectedRoomId(series.roomId);
      setReserveWholeSite(series.reserveWholeSite);
      setSelectedTeamIds(series.teams.map(team => team.id));
    }
  }, [series]);

  // When the site changes, filter rooms to that site and clear the room if it
  // does not belong to the selected site.
  useEffect(() => {
    if (selectedRoomId && selectedSiteId) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (room && room.siteId !== selectedSiteId) {
        setSelectedRoomId(null);
      }
    }
  }, [selectedSiteId, rooms, selectedRoomId]);

  const availableRooms = selectedSiteId ? rooms.filter(r => r.siteId === selectedSiteId) : rooms;

  const handleSave = async () => {
    if (!series) return;
    setActionError(null);
    try {
      await updateConfig({
        seriesId: series.id,
        data: {
          siteId: selectedSiteId,
          roomId: selectedRoomId,
          reserveWholeSite,
          teamIds: selectedTeamIds,
        },
      }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  if (!validId) {
    return (
      <Box p="md">
        <Alert color="red">Invalid event ID</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!series) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Event not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={700} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{series.title}</Title>
          {canWrite && (
            <Button variant="filled" onClick={handleSave} loading={saving}>
              {t('common.save')}
            </Button>
          )}
        </Group>

        {error && (
          <Alert color="red" variant="light" mb="md">
            {error}
          </Alert>
        )}

        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('events.organization')}
            </Text>
            <Text>{series.organizationName}</Text>
          </Box>

          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('events.seriesTitle')}
            </Text>
            <Text>{series.title}</Text>
          </Box>

          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('events.start')}
            </Text>
            <Text>{new Date(series.start).toLocaleString()}</Text>
          </Box>

          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('events.durationMinutes')}
            </Text>
            <Text>{series.durationMinutes}</Text>
          </Box>

          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('events.site')}
            </Text>
            {canWrite ? (
              <Select
                value={selectedSiteId}
                onChange={value => {
                  setSelectedSiteId(value);
                  setSelectedRoomId(null);
                  setReserveWholeSite(false);
                }}
                data={sites.map(s => ({ value: s.id, label: s.name }))}
                placeholder={t('events.noSite')}
                clearable
              />
            ) : (
              <Text>{series.siteName ?? t('events.noSite')}</Text>
            )}
          </Box>

          {selectedSiteId && (
            <>
              <Box>
                <Text size="sm" fw={500} c="dimmed" mb={4}>
                  {t('events.room')}
                </Text>
                {canWrite ? (
                  <Select
                    value={selectedRoomId}
                    onChange={setSelectedRoomId}
                    data={availableRooms.map(r => ({ value: r.id, label: r.name }))}
                    placeholder={t('events.roomUnclear')}
                    clearable
                  />
                ) : (
                  <Text>{series.roomName ?? t('events.roomUnclear')}</Text>
                )}
              </Box>

              {!selectedRoomId && canWrite && (
                <Checkbox
                  label={t('events.reserveWholeSite')}
                  checked={reserveWholeSite}
                  onChange={e => setReserveWholeSite(e.currentTarget.checked)}
                />
              )}
              {!canWrite && reserveWholeSite && !series.roomId && (
                <Badge color="blue" variant="light">
                  {t('events.wholeSiteReserved')}
                </Badge>
              )}
            </>
          )}

          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('events.assignedTeams')}
            </Text>
            {canWrite ? (
              <MultiSelect
                value={selectedTeamIds}
                onChange={setSelectedTeamIds}
                data={teams.map(team => ({ value: team.id, label: team.name }))}
                placeholder={t('events.noTeams')}
                clearable
                searchable
              />
            ) : (
              <Group gap="xs">
                {series.teams.length > 0 ? (
                  series.teams.map(team => (
                    <Badge key={team.id} size="lg" variant="light">
                      {team.name}
                    </Badge>
                  ))
                ) : (
                  <Text c="dimmed">{t('events.noTeams')}</Text>
                )}
              </Group>
            )}
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/events/management')}>
            {t('events.backToList')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default EventConfigPage;
