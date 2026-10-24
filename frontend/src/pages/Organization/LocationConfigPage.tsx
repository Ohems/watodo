import {
  Alert,
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
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { locationsApi } from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Location } from '../../types/index.js';

function LocationConfigPage() {
  const { t } = useTranslation();
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('location-management:write') === true;

  const [location, setLocation] = useState<Location | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const load = useCallback(async () => {
    if (!activeOrganizationId || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await locationsApi.getLocation(activeOrganizationId, locationId);
      setLocation(data);
      setEditName(data.name);
      setEditDescription(data.description);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!activeOrganizationId || !locationId) return;
    setSaving(true);
    setError(null);
    try {
      await locationsApi.updateLocation(activeOrganizationId, locationId, {
        name: editName,
        description: editDescription,
      });
      setEditing(false);
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

  if (!location) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Location not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={600} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{editing ? t('locations.editLocation') : location.name}</Title>
          {canWrite && (
            <Group>
              {!editing ? (
                <Button variant="filled" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="default"
                    onClick={() => {
                      setEditing(false);
                      setEditName(location.name);
                      setEditDescription(location.description);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button variant="filled" onClick={handleSave} loading={saving}>
                    {t('common.save')}
                  </Button>
                </>
              )}
            </Group>
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
              {t('common.name')}
            </Text>
            {editing ? (
              <TextInput value={editName} onChange={e => setEditName(e.target.value)} />
            ) : (
              <Text>{location.name}</Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.description')}
            </Text>
            {editing ? (
              <TextInput
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
              />
            ) : (
              <Text>
                {location.description || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}
              </Text>
            )}
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/organization/locations')}>
            {t('locations.backToList')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default LocationConfigPage;
