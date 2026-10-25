import { Box, Center, Flex, Loader, Text, Title } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage, useGetUsersQuery } from '../../api/index.js';
import UserCard from '../../components/UserCard/UserCard.js';

function UserList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: users = [], isLoading: loading, error } = useGetUsersQuery({ page: 0, limit: 50 });

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (error) {
    return (
      <Box p="xl">
        <Text c="red">{getApiErrorMessage(error)}</Text>
      </Box>
    );
  }

  return (
    <Box p="md">
      <Title order={3} mb="md">
        {t('users.title')}
      </Title>
      <Flex wrap="wrap">
        <UserCard onClick={() => navigate('/users/new')}>
          <IconUserPlus size={36} style={{ marginBottom: 4 }} />
          <Text size="sm">{t('users.addNew')}</Text>
        </UserCard>
        {users.map(user => (
          <UserCard key={user.id} onClick={() => navigate(`/users/${user.id}`)}>
            <Text size="sm" fw={500}>
              {user.name}
            </Text>
            <Text size="xs" c="dimmed">
              {user.email}
            </Text>
          </UserCard>
        ))}
      </Flex>
    </Box>
  );
}

export default UserList;
