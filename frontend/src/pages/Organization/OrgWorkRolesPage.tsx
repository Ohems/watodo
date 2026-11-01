import { Button, Group, Modal, Textarea, TextInput } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useCreateWorkRoleMutation,
  useGetCurrentUserQuery,
  useGetWorkRolesQuery,
} from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { WorkRole } from '../../types/index.js';

function OrgWorkRolesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('work-role-management:write') === true;

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  const { data, isLoading: loading } = useGetWorkRolesQuery(
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          query: { page, limit, search: search || undefined },
        }
      : skipToken,
  );
  const [createWorkRole] = useCreateWorkRoleMutation();

  const handleAdd = async () => {
    if (!activeOrganizationId || !newName.trim()) return;
    try {
      await createWorkRole({
        organizationId: activeOrganizationId,
        data: {
          name: newName.trim(),
          description: newDescription.trim(),
          organizationId: activeOrganizationId,
        },
      }).unwrap();
      setAddModalOpen(false);
      setNewName('');
      setNewDescription('');
    } catch {
      // Ignore
    }
  };

  const columns: DataTableColumn<WorkRole>[] = [
    {
      key: 'name',
      label: t('common.name'),
      render: item => <span style={{ fontWeight: 500 }}>{item.name}</span>,
    },
    {
      key: 'description',
      label: t('common.description'),
      render: item => <span>{item.description || '-'}</span>,
    },
  ];

  return (
    <>
      <DataTable
        title={t('nav.orgWorkRoles')}
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
        onRowClick={item => navigate(`/organization/work-roles/${item.id}`)}
      />
      <Modal
        opened={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title={t('workRoles.newWorkRole')}
      >
        <TextInput
          label={t('common.name')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
          mb="md"
        />
        <Textarea
          label={t('common.description')}
          value={newDescription}
          onChange={e => setNewDescription(e.target.value)}
          mb="md"
          minRows={2}
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

export default OrgWorkRolesPage;
