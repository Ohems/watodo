import {
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { roomsApi, sitesApi } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Room, Site, TableQuery } from '../../types/index.js';

function SiteConfigPage() {
  const { t } = useTranslation();
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWriteSite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('site-management:write') === true;
  const canWriteRoom =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('room-management:write') === true;

  const [site, setSite] = useState<Site | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsTotal, setRoomsTotal] = useState(0);
  const [roomsPage, setRoomsPage] = useState(0);
  const [roomsLimit, setRoomsLimit] = useState(50);
  const [roomsSearch, setRoomsSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const [addRoomModalOpen, setAddRoomModalOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');

  const load = useCallback(async () => {
    if (!activeOrganizationId || !siteId) return;
    setLoading(true);
    setError(null);
    try {
      const siteData = await sitesApi.getSite(activeOrganizationId, siteId);
      setSite(siteData);
      setEditName(siteData.name);
      setEditDescription(siteData.description ?? '');
      setEditAddress(siteData.address ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, siteId]);

  const loadRooms = useCallback(async () => {
    if (!activeOrganizationId || !siteId) return;
    try {
      const query: TableQuery = {
        page: roomsPage,
        limit: roomsLimit,
        search: roomsSearch || undefined,
      };
      const result = await roomsApi.listRoomsBySite(activeOrganizationId, siteId, query);
      setRooms(result.items);
      setRoomsTotal(result.total);
    } catch {
      setRooms([]);
      setRoomsTotal(0);
    }
  }, [activeOrganizationId, siteId, roomsPage, roomsLimit, roomsSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleSave = async () => {
    if (!activeOrganizationId || !siteId) return;
    setSaving(true);
    setError(null);
    try {
      await sitesApi.updateSite(activeOrganizationId, siteId, {
        name: editName,
        description: editDescription.trim() || null,
        address: editAddress.trim() || null,
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleAddRoom = async () => {
    if (!activeOrganizationId || !siteId || !newRoomName.trim()) return;
    try {
      await roomsApi.createRoom(activeOrganizationId, siteId, {
        name: newRoomName.trim(),
        description: newRoomDescription.trim(),
      });
      setAddRoomModalOpen(false);
      setNewRoomName('');
      setNewRoomDescription('');
      await loadRooms();
    } catch {
      // Ignore
    }
  };

  const roomColumns: DataTableColumn<Room>[] = [
    {
      key: 'name',
      label: t('common.name'),
      render: item => <span style={{ fontWeight: 500 }}>{item.name}</span>,
    },
    {
      key: 'description',
      label: t('common.description'),
      render: item => item.description || <span style={{ color: '#999' }}>-</span>,
    },
  ];

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!site) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Site not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={800} mx="auto">
      <Paper shadow="sm" p="lg" mb="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{editing ? t('sites.editSite') : site.name}</Title>
          {canWriteSite && (
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
                      setEditName(site.name);
                      setEditDescription(site.description ?? '');
                      setEditAddress(site.address ?? '');
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
              <Text>{site.name}</Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('sites.address')}
            </Text>
            {editing ? (
              <TextInput value={editAddress} onChange={e => setEditAddress(e.target.value)} />
            ) : (
              <Text>{site.address || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}</Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.description')}
            </Text>
            {editing ? (
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                autosize
                minRows={2}
              />
            ) : (
              <Text>
                {site.description || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}
              </Text>
            )}
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/organization/sites')}>
            {t('sites.backToList')}
          </Button>
        </Box>
      </Paper>

      {/* Rooms within this site */}
      <DataTable
        title={t('rooms.title')}
        columns={roomColumns}
        data={rooms}
        total={roomsTotal}
        page={roomsPage}
        limit={roomsLimit}
        loading={false}
        canAdd={canWriteRoom}
        onAdd={() => setAddRoomModalOpen(true)}
        onPageChange={setRoomsPage}
        onLimitChange={setRoomsLimit}
        onSearch={setRoomsSearch}
        onRowClick={item => navigate(`/organization/sites/${siteId}/rooms/${item.id}`)}
      />

      <Modal
        opened={addRoomModalOpen}
        onClose={() => setAddRoomModalOpen(false)}
        title={t('rooms.newRoom')}
      >
        <TextInput
          label={t('common.name')}
          value={newRoomName}
          onChange={e => setNewRoomName(e.target.value)}
          mb="sm"
        />
        <TextInput
          label={t('common.description')}
          value={newRoomDescription}
          onChange={e => setNewRoomDescription(e.target.value)}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setAddRoomModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="filled" onClick={handleAddRoom} disabled={!newRoomName.trim()}>
            {t('common.save')}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

export default SiteConfigPage;
