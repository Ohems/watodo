import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
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
import { eventManagementApi, locationsApi, teamsApi } from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { EventSeriesManagement, Location, Team } from '../../types/index.js';

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
  const [locations, setLocations] = useState<Location[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
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
      const [seriesData, locationsData, teamsData] = await Promise.all([
        eventManagementApi.getEventSeries(seriesId),
        activeOrganizationId
          ? locationsApi.listAllLocations(activeOrganizationId)
          : Promise.resolve([]),
        activeOrganizationId
          ? teamsApi.listTeams(activeOrganizationId, { limit: 200 })
          : Promise.resolve({ items: [] }),
      ]);
      setSeries(seriesData);
      setLocations(locationsData);
      setTeams(teamsData.items);
      setSelectedLocationId(seriesData.locationId);
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

  const handleSave = async () => {
    if (!series) return;
    setSaving(true);
    setError(null);
    try {
      await eventManagementApi.updateConfig(series.id, {
        locationId: selectedLocationId,
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
              {t('events.location')}
            </Text>
            {canWrite ? (
              <Select
                value={selectedLocationId}
                onChange={setSelectedLocationId}
                data={locations.map(loc => ({ value: loc.id, label: loc.name }))}
                placeholder={t('events.noLocation')}
                clearable
              />
            ) : (
              <Text>{series.locationName ?? t('events.noLocation')}</Text>
            )}
          </Box>

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
