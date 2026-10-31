import { Badge, Button, Group, Modal, Select, TextInput } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useCreateTeamMutation,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetEventTypesQuery,
  useGetTeamsQuery,
} from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { Team, TeamType } from '../../types/index.js';

const TEAM_TYPES: TeamType[] = ['general', 'event_organizers', 'role_group'];

function TeamsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('team-management:write') === true;

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');
  const [newTeamType, setNewTeamType] = useState<TeamType>('general');
  const [newEventTypeId, setNewEventTypeId] = useState<string | null>(null);
  const [newWorkRoleId, setNewWorkRoleId] = useState<string | null>(null);

  const { data, isLoading: loading } = useGetTeamsQuery(
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          query: { page, limit, search: search || undefined },
        }
      : skipToken,
  );
  // The link selects are only needed while the create modal is open and the
  // chosen type requires a link.
  const { data: eventTypes = [] } = useGetEventTypesQuery(
    addModalOpen && newTeamType === 'event_organizers' && activeOrganizationId
      ? activeOrganizationId
      : skipToken,
  );
  const { data: workRoles = [] } = useGetAllWorkRolesQuery(
    addModalOpen && newTeamType === 'role_group' && activeOrganizationId
      ? activeOrganizationId
      : skipToken,
  );
  const [createTeam] = useCreateTeamMutation();

  const handleAdd = async () => {
    if (!activeOrganizationId || !newTeamName.trim()) return;
    try {
      await createTeam({
        organizationId: activeOrganizationId,
        data: {
          name: newTeamName.trim(),
          description: newTeamDescription.trim(),
          organizationId: activeOrganizationId,
          teamType: newTeamType,
          eventTypeId:
            newTeamType === 'event_organizers' && newEventTypeId ? Number(newEventTypeId) : null,
          workRoleId: newTeamType === 'role_group' && newWorkRoleId ? Number(newWorkRoleId) : null,
        },
      }).unwrap();
      setAddModalOpen(false);
      setNewTeamName('');
      setNewTeamDescription('');
      setNewTeamType('general');
      setNewEventTypeId(null);
      setNewWorkRoleId(null);
    } catch {
      // Ignore
    }
  };

  const columns: DataTableColumn<Team>[] = [
    {
      key: 'name',
      label: t('common.name'),
      render: item => <span style={{ fontWeight: 500 }}>{item.name}</span>,
    },
    {
      key: 'teamType',
      label: t('teams.type'),
      render: item => (
        <Badge variant="light" color={item.teamType === 'general' ? 'gray' : 'blue'}>
          {t(`teams.teamType.${item.teamType}`)}
        </Badge>
      ),
    },
    {
      key: 'description',
      label: t('common.description'),
      render: item => item.description || <span style={{ color: '#999' }}>-</span>,
    },
    {
      key: 'memberCount',
      label: t('teams.memberCount'),
      render: item => <span>{item.memberCount}</span>,
    },
  ];

  return (
    <>
      <DataTable
        title={t('nav.teams')}
        columns={columns}
        data={data?.items ?? []}
        total={data?.total ?? 0}
        page={page}
        limit={limit}
        loading={loading}
        canAdd={canWrite}
        onAdd={() => setAddModalOpen(true)}
        onPageChange={setPage}
        onLimitChange={setLimit}
        onSearch={setSearch}
        onRowClick={item => navigate(`/teams/${item.id}`)}
      />
      <Modal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('teams.newTeam')}
      >
        <TextInput
          label={t('common.name')}
          value={newTeamName}
          onChange={e => setNewTeamName(e.target.value)}
          mb="sm"
        />
        <TextInput
          label={t('common.description')}
          value={newTeamDescription}
          onChange={e => setNewTeamDescription(e.target.value)}
          mb="sm"
        />
        <Select
          label={t('teams.type')}
          placeholder={t('teams.type')}
          value={newTeamType}
          onChange={value => {
            setNewTeamType((value ?? 'general') as TeamType);
            setNewEventTypeId(null);
            setNewWorkRoleId(null);
          }}
          data={TEAM_TYPES.map(type => ({ value: type, label: t(`teams.teamType.${type}`) }))}
          mb="sm"
        />
        {newTeamType === 'event_organizers' && (
          <Select
            label={t('teams.eventType')}
            placeholder={t('teams.eventType')}
            value={newEventTypeId}
            onChange={setNewEventTypeId}
            data={eventTypes.map(et => ({ value: String(et.id), label: et.name }))}
            searchable
            mb="sm"
          />
        )}
        {newTeamType === 'role_group' && (
          <Select
            label={t('teams.workRole')}
            placeholder={t('teams.workRole')}
            value={newWorkRoleId}
            onChange={setNewWorkRoleId}
            data={workRoles.map(wr => ({ value: String(wr.id), label: wr.name }))}
            searchable
            mb="sm"
          />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setAddModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="filled"
            onClick={handleAdd}
            disabled={
              !newTeamName.trim() ||
              (newTeamType === 'event_organizers' && !newEventTypeId) ||
              (newTeamType === 'role_group' && !newWorkRoleId)
            }
          >
            {t('common.save')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}

export default TeamsPage;
