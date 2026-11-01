import {
  Alert,
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
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { getApiErrorMessage, useGetUsersQuery, useUpdateUserMutation } from '../../api/index.js';
import EditField from '../../components/EditField/EditField.js';
import type { UserPush } from '../../types/index.js';

function UserProfile() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const {
    data: users = [],
    isLoading: loading,
    error: queryError,
  } = useGetUsersQuery({
    page: 0,
    limit: 50,
  });
  const [updateUser, { error: updateError }] = useUpdateUserMutation();

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<UserPush>({});

  const user = users.find(u => u.id === userId);
  const isNew = userId === 'new';
  const error = queryError ?? updateError;

  useEffect(() => {
    if (!isNew && user) {
      setEditData({
        name: user.name,
        email: user.email,
        description: user.description,
        state: user.state,
      });
    }
  }, [isNew, user]);

  const handleSave = async () => {
    if (user) {
      try {
        await updateUser({ userId: user.id, data: editData }).unwrap();
      } catch {
        // The update error is shown via the mutation state.
      }
    }
    setEditing(false);
  };

  if (loading && !user) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Box p="md" maw={600} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>
            {isNew
              ? t('userProfile.newUser')
              : editing
                ? t('userProfile.editUser')
                : (user?.name ?? t('userProfile.title'))}
          </Title>
          {!isNew && (
            <Group>
              {!editing ? (
                <Button variant="filled" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="default"
                    onClick={() => {
                      setEditing(false);
                      if (user)
                        setEditData({
                          name: user.name,
                          email: user.email,
                          description: user.description,
                          state: user.state,
                        });
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button variant="filled" onClick={handleSave}>
                    {t('common.save')}
                  </Button>
                </>
              )}
            </Group>
          )}
        </Group>

        {error && (
          <Alert color="red" variant="light" mb="md">
            {getApiErrorMessage(error)}
          </Alert>
        )}

        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.name')}
            </Text>
            <EditField
              value={editData.name ?? user?.name ?? ''}
              editing={editing || isNew}
              label={t('common.name')}
              onChange={v => setEditData(p => ({ ...p, name: v }))}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.email')}
            </Text>
            <EditField
              value={editData.email ?? user?.email ?? ''}
              editing={editing || isNew}
              label={t('common.email')}
              onChange={v => setEditData(p => ({ ...p, email: v }))}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.description')}
            </Text>
            <EditField
              value={editData.description ?? user?.description ?? ''}
              editing={editing || isNew}
              label={t('common.description')}
              onChange={v => setEditData(p => ({ ...p, description: v }))}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('userProfile.permissions')}
            </Text>
            <Text size="sm">
              {user?.permissions?.length ? user.permissions.join(', ') : t('common.none')}
            </Text>
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('userProfile.state')}
            </Text>
            <EditField
              value={editData.state ?? user?.state ?? 'active'}
              editing={editing || isNew}
              label={t('userProfile.state')}
              options={[
                { value: 'active', label: t('userProfile.stateActive') },
                { value: 'inactive', label: t('userProfile.stateInactive') },
              ]}
              onChange={v => setEditData(p => ({ ...p, state: v as 'active' | 'inactive' }))}
            />
          </Box>
        </Stack>

        {!isNew && (
          <Box mt="lg">
            <Button variant="subtle" onClick={() => navigate('/users')}>
              {t('userProfile.backToList')}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default UserProfile;
