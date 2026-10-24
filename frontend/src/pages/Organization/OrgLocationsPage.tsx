import { Button, Group, Modal, TextInput } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { locationsApi } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Location, TableQuery } from '../../types/index.js';

function OrgLocationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('location-management:write') === true;

  const [data, setData] = useState<Location[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      const query: TableQuery = { page, limit, search: search || undefined };
      const result = await locationsApi.listLocations(activeOrganizationId, query);
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
    if (!activeOrganizationId || !newName.trim()) return;
    try {
      await locationsApi.createLocation(activeOrganizationId, {
        name: newName.trim(),
        description: newDescription.trim(),
        organizationId: activeOrganizationId,
      });
      setAddModalOpen(false);
      setNewName('');
      setNewDescription('');
      await load();
    } catch {
      // Ignore
    }
  };

  const columns: DataTableColumn<Location>[] = [
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

  return (
    <>
      <DataTable
        title={t('nav.orgLocations')}
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
        onRowClick={item => navigate(`/organization/locations/${item.id}`)}
      />
      <Modal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('locations.newLocation')}
      >
        <TextInput
          label={t('common.name')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          mb="sm"
        />
        <TextInput
          label={t('common.description')}
          value={newDescription}
          onChange={e => setNewDescription(e.target.value)}
          mb="md"
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setAddModalOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="filled" onClick={handleAdd} disabled={!newName.trim()}>
            {t('common.save')}
          </Button>
        </Group>
      </Modal>
    </>
  );
}

export default OrgLocationsPage;
