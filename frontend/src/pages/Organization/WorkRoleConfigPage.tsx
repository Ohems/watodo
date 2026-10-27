import {
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  MultiSelect,
  Paper,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useAddCertificationToWorkRoleMutation,
  useGetAllCertificationsQuery,
  useGetCurrentUserQuery,
  useGetWorkRoleQuery,
  useRemoveCertificationFromWorkRoleMutation,
  useUpdateWorkRoleMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function WorkRoleConfigPage() {
  const { t } = useTranslation();
  const { workRoleId } = useParams<{ workRoleId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('work-role-management:write') === true;

  const parsedId = Number.parseInt(workRoleId ?? '', 10);
  const roleArg =
    activeOrganizationId && !Number.isNaN(parsedId)
      ? { organizationId: activeOrganizationId, workRoleId: parsedId }
      : skipToken;
  const { data: role, isLoading: loading, error: roleError } = useGetWorkRoleQuery(roleArg);
  const { data: allCerts } = useGetAllCertificationsQuery(activeOrganizationId ?? skipToken);
  const [updateWorkRole, { isLoading: saving }] = useUpdateWorkRoleMutation();
  const [addCert] = useAddCertificationToWorkRoleMutation();
  const [removeCert] = useRemoveCertificationFromWorkRoleMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const error = actionError ?? (roleError ? getApiErrorMessage(roleError) : null);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [selectedCerts, setSelectedCerts] = useState<string[]>([]);

  useEffect(() => {
    if (role) {
      setEditName(role.name);
      setEditDescription(role.description);
      setSelectedCerts(role.requiredCertifications.map(c => String(c.id)));
    }
  }, [role]);

  const handleSave = async () => {
    if (!activeOrganizationId || Number.isNaN(parsedId)) return;
    setActionError(null);
    try {
      await updateWorkRole({
        organizationId: activeOrganizationId,
        workRoleId: parsedId,
        data: { name: editName, description: editDescription },
      }).unwrap();
      setEditing(false);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleCertsChange = async (values: string[]) => {
    if (!activeOrganizationId || Number.isNaN(parsedId)) return;
    const previous = selectedCerts;
    setSelectedCerts(values);
    const added = values.filter(v => !previous.includes(v));
    const removed = previous.filter(v => !values.includes(v));
    try {
      for (const id of added) {
        await addCert({
          organizationId: activeOrganizationId,
          workRoleId: parsedId,
          certificationId: Number.parseInt(id, 10),
        }).unwrap();
      }
      for (const id of removed) {
        await removeCert({
          organizationId: activeOrganizationId,
          workRoleId: parsedId,
          certificationId: Number.parseInt(id, 10),
        }).unwrap();
      }
    } catch (err) {
      setActionError(getApiErrorMessage(err));
      setSelectedCerts(previous);
    }
  };

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!role) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? t('workRoles.notFound')}</Alert>
      </Box>
    );
  }

  const certOptions = (allCerts ?? []).map(c => ({ value: String(c.id), label: c.name }));

  return (
    <Box p="md" maw={800} mx="auto">
      <Paper shadow="sm" p="lg" mb="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>{editing ? t('workRoles.editWorkRole') : role.name}</Title>
          {canWrite && (
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
                      setEditName(role.name);
                      setEditDescription(role.description);
                    }}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button variant="filled" onClick={handleSave} loading={saving}>
                    {t('common.save')}
                  </Button>
                </>
              )}
            </Group>
          )}
        </Group>

        {error && (
          <Alert color="red" variant="light" mb="md">
            {error}
          </Alert>
        )}

        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.name')}
            </Text>
            {editing ? (
              <TextInput value={editName} onChange={e => setEditName(e.target.value)} />
            ) : (
              <Text>{role.name}</Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('common.description')}
            </Text>
            {editing ? (
              <Textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                minRows={2}
              />
            ) : (
              <Text>{role.description || '-'}</Text>
            )}
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('workRoles.requiredCertifications')}
            </Text>
            {canWrite ? (
              <MultiSelect
                data={certOptions}
                value={selectedCerts}
                onChange={handleCertsChange}
                placeholder={t('workRoles.selectCertifications')}
                searchable
                clearable
              />
            ) : (
              <Group gap="xs">
                {role.requiredCertifications.length === 0 ? (
                  <Text c="dimmed">{t('common.none')}</Text>
                ) : (
                  role.requiredCertifications.map(c => (
                    <Badge key={c.id} variant="light">
                      {c.name}
                    </Badge>
                  ))
                )}
              </Group>
            )}
          </Box>
        </Stack>

        <Box mt="lg">
          <Button variant="subtle" onClick={() => navigate('/organization/work-roles')}>
            {t('workRoles.backToList')}
          </Button>
        </Box>
      </Paper>

      <Paper shadow="sm" p="lg">
        <Title order={4} mb="md">
          {t('workRoles.assignedUsers')}
        </Title>
        {role.users.length === 0 ? (
          <Text c="dimmed">{t('workRoles.noUsers')}</Text>
        ) : (
          <Stack gap="xs">
            {role.users.map(u => (
              <Group key={u.id} justify="space-between">
                <Box>
                  <Text fw={500}>{u.userName}</Text>
                  <Text size="sm" c="dimmed">
                    {u.userEmail}
                  </Text>
                </Box>
                <Group gap="xs">
                  {u.isQualified && (
                    <Badge color="green" variant="light">
                      {t('workRoles.qualified')}
                    </Badge>
                  )}
                  {u.notes && (
                    <Text size="sm" c="dimmed">
                      {u.notes}
                    </Text>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

export default WorkRoleConfigPage;
