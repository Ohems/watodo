import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { teamsApi } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { TableQuery, Team } from '../../types/index.js';

function TeamsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('team-management:write') === true;

  const [data, setData] = useState<Team[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDescription, setNewTeamDescription] = useState('');

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      const query: TableQuery = { page, limit, search: search || undefined };
      const result = await teamsApi.listTeams(activeOrganizationId, query);
      setData(result.items);
      setTotal(result.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, page, limit, search]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!activeOrganizationId || !newTeamName.trim()) return;
    try {
      await teamsApi.createTeam(activeOrganizationId, {
        name: newTeamName.trim(),
        description: newTeamDescription.trim(),
        organizationId: activeOrganizationId,
      });
      setAddModalOpen(false);
      setNewTeamName('');
      setNewTeamDescription('');
      await load();
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
        data={data}
        total={total}
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
