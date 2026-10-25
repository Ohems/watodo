import {
  Alert,
  Avatar,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { getApiErrorMessage, useGetOrganizationUsersQuery } from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function OrgUserProfilePage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);

  const {
    data,
    isLoading: loading,
    error: queryError,
  } = useGetOrganizationUsersQuery(
    activeOrganizationId
      ? { organizationId: activeOrganizationId, query: { page: 0, limit: 200 } }
      : skipToken,
  );

  const user = data?.items.find(u => u.id === userId) ?? null;
  const error = queryError
    ? getApiErrorMessage(queryError)
    : data && !user
      ? 'User not found'
      : null;

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!user) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'User not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={600} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group gap="md" mb="lg">
          <Avatar size={80} radius="xl" color="blue">
            {user.name.charAt(0).toUpperCase()}
          </Avatar>
          <Title order={3}>{user.name}</Title>
        </Group>

        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.name')}
            </Text>
            <Text>{user.name}</Text>
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.email')}
            </Text>
            <Text>{user.email}</Text>
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/organization/users')}>
            {t('orgUsers.backToList')}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

export default OrgUserProfilePage;
