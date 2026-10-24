import {
  ActionIcon,
  Alert,
  Avatar,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { teamsApi, usersApi } from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Team, TeamMember, UserListItem } from '../../types/index.js';

function TeamManagementPage() {
  const { t } = useTranslation();
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('team-management:write') === true;

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [allUsers, setAllUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganizationId || !teamId) return;
    setLoading(true);
    setError(null);
    try {
      const [teamData, membersData, usersData] = await Promise.all([
        teamsApi.getTeam(activeOrganizationId, teamId),
        teamsApi.listMembers(activeOrganizationId, teamId),
        usersApi.getUserList(),
      ]);
      setTeam(teamData);
      setMembers(membersData);
      setAllUsers(usersData);
      setEditName(teamData.name);
      setEditDescription(teamData.description);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, teamId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = async () => {
    if (!activeOrganizationId || !teamId) return;
    try {
      await teamsApi.updateTeam(activeOrganizationId, teamId, {
        name: editName,
        description: editDescription,
      });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleAddMember = async () => {
    if (!activeOrganizationId || !teamId || !selectedUserId) return;
    try {
      await teamsApi.addMember(activeOrganizationId, teamId, selectedUserId);
      setAddModalOpen(false);
      setSelectedUserId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRemoveMember = async () => {
    if (!activeOrganizationId || !teamId || !deleteTarget) return;
    try {
      await teamsApi.removeMember(activeOrganizationId, teamId, deleteTarget.userId);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const memberUserIds = new Set(members.map(m => m.userId));
  const availableUsers = allUsers.filter(u => !memberUserIds.has(u.id));

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!team) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Team not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={800} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{editing ? t('teams.editTeam') : team.name}</Title>
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
                      setEditName(team.name);
                      setEditDescription(team.description);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button variant="filled" onClick={handleSave}>
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

        <Stack gap="md" mb="lg">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.name')}
            </Text>
            {editing ? (
              <TextInput value={editName} onChange={e => setEditName(e.target.value)} />
            ) : (
              <Text>{team.name}</Text>
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
                {team.description || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}
              </Text>
            )}
          </Box>
        </Stack>

        <Group justify="space-between" mb="sm">
          <Title order={4}>{t('teams.members')}</Title>
          {canWrite && (
            <Button
              variant="filled"
              size="sm"
              leftSection={<IconUserPlus size={16} />}
              onClick={() => setAddModalOpen(true)}
            >
              {t('teams.addMember')}
            </Button>
          )}
        </Group>

        <Paper withBorder>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('common.name')}</Table.Th>
                <Table.Th>{t('common.email')}</Table.Th>
                {canWrite && (
                  <Table.Th style={{ textAlign: 'right' }}>{t('common.actions')}</Table.Th>
                )}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {members.map(member => (
                <Table.Tr key={member.id}>
                  <Table.Td>
                    <Group gap="xs">
                      <Avatar size="sm" radius="xl">
                        {member.userName.charAt(0).toUpperCase()}
                      </Avatar>
                      <Text size="sm">{member.userName}</Text>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {member.userEmail}
                    </Text>
                  </Table.Td>
                  {canWrite && (
                    <Table.Td style={{ textAlign: 'right' }}>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => setDeleteTarget(member)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
              {members.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={canWrite ? 3 : 2} style={{ textAlign: 'center' }}>
                    <Text c="dimmed">{t('teams.noMembers')}</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Paper>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/teams')}>
            {t('teams.backToList')}
          </Button>
        </Box>
      </Paper>

      {/* Add member modal */}
      <Modal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('teams.addMember')}
      >
        <Select
          label={t('common.name')}
          placeholder={t('common.select')}
          value={selectedUserId}
          onChange={setSelectedUserId}
          data={availableUsers.map(u => ({ value: u.id, label: u.name }))}
          searchable
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setAddModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="filled" onClick={handleAddMember} disabled={!selectedUserId}>
            {t('common.add')}
          </Button>
        </Group>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('common.delete')}
      >
        <Text size="sm">
          Remove {deleteTarget?.userName} from {team.name}?
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button color="red" variant="filled" onClick={handleRemoveMember}>
            {t('common.delete')}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

export default TeamManagementPage;
