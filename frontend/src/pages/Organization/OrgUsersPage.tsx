import { Avatar } from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGetOrganizationUsersQuery } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { OrganizationUser } from '../../types/index.js';

function OrgUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);

  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');

  const { data, isLoading: loading } = useGetOrganizationUsersQuery(
    activeOrganizationId
      ? {
          organizationId: activeOrganizationId,
          query: { page, limit, search: search || undefined },
        }
      : skipToken,
  );
  const users = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns: DataTableColumn<OrganizationUser>[] = [
    {
      key: 'avatar',
      label: t('orgUsers.profilePicture'),
      render: item => (
        <Avatar size="sm" radius="xl" color="blue">
          {item.name.charAt(0).toUpperCase()}
        </Avatar>
      ),
    },
    {
      key: 'name',
      label: t('common.name'),
      render: item => <span style={{ fontWeight: 500 }}>{item.name}</span>,
    },
  ];

  return (
    <DataTable
      title={t('nav.orgUsers')}
      columns={columns}
      data={users}
      total={total}
      page={page}
      limit={limit}
      loading={loading}
      onPageChange={setPage}
      onLimitChange={setLimit}
      onSearch={setSearch}
      onRowClick={item => navigate(`/organization/users/${item.id}`)}
    />
  );
}

export default OrgUsersPage;
