import {
  ActionIcon,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { IconTrash, IconUserPlus } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useAddTeamMemberMutation,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetEventSeriesManagementListQuery,
  useGetOrganizationUsersQuery,
  useGetTeamMembersQuery,
  useGetTeamQuery,
  useGetUserListQuery,
  useRemoveTeamMemberMutation,
  useUpdateTeamMemberMutation,
  useUpdateTeamMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { FieldErrors, TeamMember } from '../../types/index.js';
import { validateTeamUpdate } from '../../validation.js';

function TeamManagementPage() {
  const { t } = useTranslation();
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('team-management:write') === true;

  const teamArg =
    activeOrganizationId && teamId ? { organizationId: activeOrganizationId, teamId } : skipToken;
  const { data: team, isLoading: loading, error: teamError } = useGetTeamQuery(teamArg);
  const { data: members = [] } = useGetTeamMembersQuery(teamArg);
  const { data: allUsers = [] } = useGetUserListQuery(undefined);
  const { data: workRoles = [] } = useGetAllWorkRolesQuery(activeOrganizationId ?? skipToken);
  const { data: seriesData } = useGetEventSeriesManagementListQuery(
    activeOrganizationId
      ? { organizationId: activeOrganizationId, page: 0, limit: 200 }
      : skipToken,
  );
  const { data: orgUsersData } = useGetOrganizationUsersQuery(
    activeOrganizationId
      ? { organizationId: activeOrganizationId, query: { page: 0, limit: 200 } }
      : skipToken,
  );
  const [updateTeam] = useUpdateTeamMutation();
  const [addMember] = useAddTeamMemberMutation();
  const [updateTeamMember] = useUpdateTeamMemberMutation();
  const [removeMember] = useRemoveTeamMemberMutation();

  // Team managers (manager toggle on their own membership) can manage this
  // specific team even without organization-wide write permission.
  const isTeamManager = members.some(m => m.userId === currentUser?.id && m.isManager);
  const canManageTeam = canWrite || isTeamManager;

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (teamError ? getApiErrorMessage(teamError) : null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLeaderId, setEditLeaderId] = useState<string | null>(null);
  const [editWorkRoleIds, setEditWorkRoleIds] = useState<string[]>([]);
  const [editEventSeriesIds, setEditEventSeriesIds] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addAsManager, setAddAsManager] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TeamMember | null>(null);

  useEffect(() => {
    if (team) {
      setEditName(team.name);
      setEditDescription(team.description);
      setEditLeaderId(team.teamLeaderId);
      setEditWorkRoleIds(team.workRoles.map(r => String(r.id)));
      setEditEventSeriesIds(team.eventSeries.map(s => String(s.id)));
    }
  }, [team]);

  const handleSave = async () => {
    if (!activeOrganizationId || !teamId) return;
    setActionError(null);
    const validationErrors = validateTeamUpdate({ name: editName }, t);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    try {
      await updateTeam({
        organizationId: activeOrganizationId,
        teamId,
        data: {
          name: editName,
          description: editDescription,
          teamLeaderId: editLeaderId,
          workRoleIds: editWorkRoleIds.map(Number),
          eventSeriesIds: editEventSeriesIds.map(Number),
        },
      }).unwrap();
      setEditing(false);
      setFieldErrors({});
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleAddMember = async () => {
    if (!activeOrganizationId || !teamId || !selectedUserId) return;
    setActionError(null);
    try {
      await addMember({
        organizationId: activeOrganizationId,
        teamId,
        userId: selectedUserId,
        isManager: addAsManager,
      }).unwrap();
      setAddModalOpen(false);
      setSelectedUserId(null);
      setAddAsManager(false);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleToggleManager = async (member: TeamMember, isManager: boolean) => {
    if (!activeOrganizationId || !teamId) return;
    setActionError(null);
    try {
      await updateTeamMember({
        organizationId: activeOrganizationId,
        teamId,
        userId: member.userId,
        data: { isManager },
      }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleRemoveMember = async () => {
    if (!activeOrganizationId || !teamId || !deleteTarget) return;
    setActionError(null);
    try {
      await removeMember({
        organizationId: activeOrganizationId,
        teamId,
        userId: deleteTarget.userId,
      }).unwrap();
      setDeleteTarget(null);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
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
          {canManageTeam && (
            <Group>
              {!editing ? (
                <Button
                  variant="filled"
                  onClick={() => {
                    setFieldErrors({});
                    setEditing(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="default"
                    onClick={() => {
                      setEditing(false);
                      setFieldErrors({});
                      setEditName(team.name);
                      setEditDescription(team.description);
                      setEditLeaderId(team.teamLeaderId);
                      setEditWorkRoleIds(team.workRoles.map(r => String(r.id)));
                      setEditEventSeriesIds(team.eventSeries.map(s => String(s.id)));
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
            <Text size="sm" fw={500} c={fieldErrors.name ? 'red' : 'dimmed'} mb={4}>
              {t('common.name')}
            </Text>
            {editing ? (
              <TextInput
                value={editName}
                onChange={e => {
                  setEditName(e.target.value);
                  setFieldErrors(prev => {
                    if (!('name' in prev)) return prev;
                    const next = { ...prev };
                    delete next.name;
                    return next;
                  });
                }}
                error={fieldErrors.name}
                required
              />
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
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('teams.workRoles')}
            </Text>
            {editing ? (
              <MultiSelect
                placeholder={t('teams.workRoles')}
                value={editWorkRoleIds}
                onChange={setEditWorkRoleIds}
                data={workRoles.map(wr => ({ value: String(wr.id), label: wr.name }))}
                searchable
              />
            ) : team.workRoles.length > 0 ? (
              <Group gap={4}>
                {team.workRoles.map(role => (
                  <Badge key={role.id} variant="light" color="blue" size="sm">
                    {role.name}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text>
                <em style={{ color: '#999' }}>{t('common.notSet')}</em>
              </Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('teams.eventSeries')}
            </Text>
            {editing ? (
              <MultiSelect
                placeholder={t('teams.eventSeries')}
                value={editEventSeriesIds}
                onChange={setEditEventSeriesIds}
                data={(seriesData?.items ?? []).map(s => ({ value: String(s.id), label: s.title }))}
                searchable
              />
            ) : team.eventSeries.length > 0 ? (
              <Group gap={4}>
                {team.eventSeries.map(series => (
                  <Badge key={series.id} variant="light" color="grape" size="sm">
                    {series.title}
                  </Badge>
                ))}
              </Group>
            ) : (
              <Text>
                <em style={{ color: '#999' }}>{t('common.notSet')}</em>
              </Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('teams.leader')}
            </Text>
            {editing ? (
              <Select
                placeholder={t('teams.leader')}
                value={editLeaderId}
                onChange={setEditLeaderId}
                data={(orgUsersData?.items ?? []).map(u => ({ value: u.id, label: u.name }))}
                searchable
                clearable
              />
            ) : (
              <Text>
                {team.teamLeaderName || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}
              </Text>
            )}
          </Box>
        </Stack>

        <Group justify="space-between" mb="sm">
          <Title order={4}>{t('teams.members')}</Title>
          {canManageTeam && (
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
                <Table.Th>{t('teams.manager')}</Table.Th>
                {canManageTeam && (
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
                      {member.hasActiveAbsence && (
                        <Badge color="orange" variant="light" size="sm">
                          {t('teams.absentNow')}
                        </Badge>
                      )}
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {member.userEmail}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    {canManageTeam ? (
                      <Switch
                        checked={member.isManager}
                        onChange={e => handleToggleManager(member, e.currentTarget.checked)}
                        aria-label={`${t('teams.manager')}: ${member.userName}`}
                      />
                    ) : (
                      member.isManager && <Badge variant="light">{t('teams.manager')}</Badge>
                    )}
                  </Table.Td>
                  {canManageTeam && (
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
                  <Table.Td colSpan={canManageTeam ? 4 : 3} style={{ textAlign: 'center' }}>
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
          mb="sm"
        />
        <Switch
          label={t('teams.canManageTeam')}
          checked={addAsManager}
          onChange={e => setAddAsManager(e.currentTarget.checked)}
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
