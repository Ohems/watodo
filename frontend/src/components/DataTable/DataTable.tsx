import {
  Box,
  Button,
  Group,
  Loader,
  Pagination,
  Paper,
  Select,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  title: string;
  columns: DataTableColumn<T>[];
  data: T[];
  total: number;
  page: number;
  limit: number;
  loading?: boolean;
  searchPlaceholder?: string;
  canAdd?: boolean;
  onAdd?: () => void;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  onSearch: (search: string) => void;
  onRowClick?: (item: T) => void;
  extraFilters?: React.ReactNode;
}

function DataTable<T extends { id: string | number }>({
  title,
  columns,
  data,
  total,
  page,
  limit,
  loading = false,
  searchPlaceholder,
  canAdd = false,
  onAdd,
  onPageChange,
  onLimitChange,
  onSearch,
  onRowClick,
  extraFilters,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState('');
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const handleSearchSubmit = () => {
    onSearch(searchInput);
    onPageChange(0);
  };

  return (
    <Box p="md">
      <Group justify="space-between" mb="md">
        <Title order={3}>{title}</Title>
        {canAdd && onAdd && (
          <Button variant="filled" leftSection={<IconPlus size={16} />} onClick={onAdd}>
            {t('common.add')}
          </Button>
        )}
      </Group>

      <Group gap="sm" mb="md" wrap="wrap">
        <TextInput
          placeholder={searchPlaceholder ?? t('common.search')}
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSearchSubmit();
          }}
          leftSection={<IconSearch size={16} />}
          style={{ minWidth: 250 }}
        />
        <Button variant="outline" onClick={handleSearchSubmit}>
          {t('common.search')}
        </Button>
        {extraFilters}
      </Group>

      <Paper shadow="sm" withBorder style={{ overflow: 'hidden' }}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              {columns.map(col => (
                <Table.Th key={col.key}>{col.label}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map(item => (
              <Table.Tr
                key={item.id}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                style={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {columns.map(col => (
                  <Table.Td key={col.key}>{col.render(item)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
            {!loading && data.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={columns.length} style={{ textAlign: 'center' }}>
                  <Text c="dimmed">{t('common.noResults')}</Text>
                </Table.Td>
              </Table.Tr>
            )}
            {loading && (
              <Table.Tr>
                <Table.Td colSpan={columns.length} style={{ textAlign: 'center' }}>
                  <Loader size="sm" />
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      <Group justify="space-between" mt="md">
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            {t('common.perPage')}:
          </Text>
          <Select
            size="xs"
            value={String(limit)}
            onChange={value => {
              if (value) {
                onLimitChange(Number(value));
                onPageChange(0);
              }
            }}
            data={['50', '100', '200']}
            style={{ width: 80 }}
          />
        </Group>
        <Pagination value={page + 1} onChange={p => onPageChange(p - 1)} total={totalPages} />
        <Text size="sm" c="dimmed">
          {t('common.page')} {page + 1} {t('common.of')} {totalPages} ({total})
        </Text>
      </Group>
    </Box>
  );
}

export default DataTable;
