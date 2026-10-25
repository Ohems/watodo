import { Button, Group, Modal, TextInput } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCreateJobMutation, useGetCurrentUserQuery, useGetJobsQuery } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { Job } from '../../types/index.js';

function OrgJobsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('job-management:write') === true;

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const { data, isLoading: loading } = useGetJobsQuery(
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          query: { page, limit, search: search || undefined },
        }
      : skipToken,
  );
  const [createJob] = useCreateJobMutation();

  const handleAdd = async () => {
    if (!activeOrganizationId || !newName.trim()) return;
    try {
      await createJob({
        organizationId: activeOrganizationId,
        data: { name: newName.trim(), organizationId: activeOrganizationId },
      }).unwrap();
      setAddModalOpen(false);
      setNewName('');
    } catch {
      // Ignore
    }
  };

  const columns: DataTableColumn<Job>[] = [
    {
      key: 'name',
      label: t('common.name'),
      render: item => <span style={{ fontWeight: 500 }}>{item.name}</span>,
    },
  ];

  return (
    <>
      <DataTable
        title={t('nav.orgJobs')}
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
        onRowClick={item => navigate(`/organization/jobs/${item.id}`)}
      />
      <Modal opened={addModalOpen} onClose={() => setAddModalOpen(false)} title={t('jobs.newJob')}>
        <TextInput
          label={t('common.name')}
          value={newName}
          onChange={e => setNewName(e.target.value)}
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

export default OrgJobsPage;
