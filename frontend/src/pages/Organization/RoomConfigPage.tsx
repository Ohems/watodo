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
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useGetCurrentUserQuery,
  useGetRoomQuery,
  useUpdateRoomMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function RoomConfigPage() {
  const { t } = useTranslation();
  const { siteId, roomId } = useParams<{ siteId: string; roomId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('room-management:write') === true;

  const roomArg =
    activeOrganizationId && siteId && roomId
      ? { organizationId: activeOrganizationId, siteId, roomId }
      : skipToken;
  const { data: room, isLoading: loading, error: roomError } = useGetRoomQuery(roomArg);
  const [updateRoom, { isLoading: saving }] = useUpdateRoomMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (roomError ? getApiErrorMessage(roomError) : null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (room) {
      setEditName(room.name);
      setEditDescription(room.description);
    }
  }, [room]);

  const handleSave = async () => {
    if (!activeOrganizationId || !siteId || !roomId) return;
    setActionError(null);
    try {
      await updateRoom({
        organizationId: activeOrganizationId,
        siteId,
        roomId,
        data: { name: editName, description: editDescription },
      }).unwrap();
      setEditing(false);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!room) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Room not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={600} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{editing ? t('rooms.editRoom') : room.name}</Title>
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
                      setEditName(room.name);
                      setEditDescription(room.description);
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
              <Text>{room.name}</Text>
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
                {room.description || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}
              </Text>
            )}
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate(`/organization/sites/${siteId}`)}>
            {t('rooms.backToSite')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default RoomConfigPage;
