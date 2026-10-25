import { Button, Group, Modal, TextInput } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useCreateTeamMutation,
  useGetCurrentUserQuery,
  useGetTeamsQuery,
} from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { Team } from '../../types/index.js';

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

  const { data, isLoading: loading } = useGetTeamsQuery(
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          query: { page, limit, search: search || undefined },
        }
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
        },
      }).unwrap();
      setAddModalOpen(false);
      setNewTeamName('');
      setNewTeamDescription('');
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
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setAddModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="filled" onClick={handleAdd} disabled={!newTeamName.trim()}>
            {t('common.save')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}

export default TeamsPage;
