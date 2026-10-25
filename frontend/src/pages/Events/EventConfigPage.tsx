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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { eventManagementApi, roomsApi, sitesApi, teamsApi } from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { EventSeriesManagement, Room, Site, Team } from '../../types/index.js';

function EventConfigPage() {
  const { t } = useTranslation();
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const [series, setSeries] = useState<EventSeriesManagement | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [reserveWholeSite, setReserveWholeSite] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const seriesId = Number.parseInt(eventId ?? '', 10);

  const load = useCallback(async () => {
    if (Number.isNaN(seriesId)) {
      setError('Invalid event ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [seriesData, sitesData, roomsData, teamsData] = await Promise.all([
        eventManagementApi.getEventSeries(seriesId),
        activeOrganizationId ? sitesApi.listAllSites(activeOrganizationId) : Promise.resolve([]),
        activeOrganizationId ? roomsApi.listAllRooms(activeOrganizationId) : Promise.resolve([]),
        activeOrganizationId
          ? teamsApi.listTeams(activeOrganizationId, { limit: 200 })
          : Promise.resolve({ items: [] }),
      ]);
      setSeries(seriesData);
      setSites(sitesData);
      setRooms(roomsData);
      setTeams(teamsData.items);
      setSelectedSiteId(seriesData.siteId);
      setSelectedRoomId(seriesData.roomId);
      setReserveWholeSite(seriesData.reserveWholeSite);
      setSelectedTeamIds(seriesData.teams.map(team => team.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [seriesId, activeOrganizationId]);

  useEffect(() => {
    load();
  }, [load]);

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
    setSaving(true);
    setError(null);
    try {
      await eventManagementApi.updateConfig(series.id, {
        siteId: selectedSiteId,
        roomId: selectedRoomId,
        reserveWholeSite,
        teamIds: selectedTeamIds,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

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
