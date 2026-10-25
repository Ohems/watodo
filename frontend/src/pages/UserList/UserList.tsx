import { Box, Center, Flex, Loader, Text, Title } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import UserCard from '../../components/UserCard/UserCard.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { fetchUsers } from '../../store/user-slice.js';

function UserList() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { users, loading, error } = useAppSelector(state => state.user);

  useEffect(() => {
    dispatch(fetchUsers({ page: 0, limit: 50 }));
  }, [dispatch]);

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
        <Text c="red">{error}</Text>
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
