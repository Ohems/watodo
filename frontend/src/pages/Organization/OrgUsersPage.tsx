import { Avatar } from '@mantine/core';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { organizationUsersApi } from '../../api/index.js';
import DataTable, { type DataTableColumn } from '../../components/DataTable/DataTable.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { OrganizationUser, TableQuery } from '../../types/index.js';

function OrgUsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(state => state.organization.activeOrganizationId);

  const [data, setData] = useState<OrganizationUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    try {
      const query: TableQuery = { page, limit, search: search || undefined };
      const result = await organizationUsersApi.listUsers(activeOrganizationId, query);
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
      data={data}
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
