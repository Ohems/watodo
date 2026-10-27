import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useAddUserCertificationMutation,
  useAddUserWorkRoleMutation,
  useGetAllCertificationsQuery,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetOrganizationUserQuery,
  useGetUserCertificationsQuery,
  useGetUserWorkRolesQuery,
  useRemoveUserCertificationMutation,
  useRemoveUserWorkRoleMutation,
  useUpdateUserCertificationMutation,
  useUpdateUserWorkRoleMutation,
} from '../../api/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function OrgUserProfilePage() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();

  const canManage =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('work-role-management:write') === true;

  const {
    data: user,
    isLoading: loading,
    error: queryError,
  } = useGetOrganizationUserQuery(
    activeOrganizationId && userId ? { organizationId: activeOrganizationId, userId } : skipToken,
  );

  // Work roles for this user (admin view)
  const { data: userWorkRoles } = useGetUserWorkRolesQuery(
    activeOrganizationId && userId ? { organizationId: activeOrganizationId, userId } : skipToken,
  );
  const { data: allRoles } = useGetAllWorkRolesQuery(activeOrganizationId ?? skipToken);

  // Certifications for this user (admin view)
  const { data: userCerts } = useGetUserCertificationsQuery(
    activeOrganizationId && userId ? { organizationId: activeOrganizationId, userId } : skipToken,
  );
  const { data: allCerts } = useGetAllCertificationsQuery(activeOrganizationId ?? skipToken);

  const [addUserRole] = useAddUserWorkRoleMutation();
  const [removeUserRole] = useRemoveUserWorkRoleMutation();
  const [updateUserRole] = useUpdateUserWorkRoleMutation();
  const [addUserCert] = useAddUserCertificationMutation();
  const [removeUserCert] = useRemoveUserCertificationMutation();
  const [updateUserCert] = useUpdateUserCertificationMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const [newRoleId, setNewRoleId] = useState<string | null>(null);
  const [newCertId, setNewCertId] = useState<string | null>(null);
  const [newCertDate, setNewCertDate] = useState('');
  const [newValidUntil, setNewValidUntil] = useState('');
  const [editingCertDates, setEditingCertDates] = useState<
    Record<number, { certificationDate: string; validUntilDate: string }>
  >({});

  const error = actionError ?? (queryError ? getApiErrorMessage(queryError) : null);

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

  if (!activeOrganizationId) {
    return (
      <Box p="md">
        <Alert color="yellow">{t('noOrganization.message')}</Alert>
      </Box>
    );
  }

  // --- Work role helpers ---

  const assignedRoleIds = new Set((userWorkRoles ?? []).map(r => String(r.workRoleId)));
  const roleOptions = (allRoles ?? [])
    .filter(r => !assignedRoleIds.has(String(r.id)))
    .map(r => ({ value: String(r.id), label: r.name }));

  const handleAddRole = async () => {
    if (!newRoleId) return;
    setActionError(null);
    try {
      await addUserRole({
        organizationId: activeOrganizationId,
        userId: user.id,
        data: { workRoleId: Number.parseInt(newRoleId, 10) },
      }).unwrap();
      setNewRoleId(null);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleRemoveRole = async (userWorkRoleId: number) => {
    setActionError(null);
    try {
      await removeUserRole({ organizationId: activeOrganizationId, userWorkRoleId }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleToggleQualified = async (userWorkRoleId: number, isQualified: boolean) => {
    setActionError(null);
    try {
      await updateUserRole({
        organizationId: activeOrganizationId,
        userWorkRoleId,
        data: { isQualified: !isQualified },
      }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  // --- Certification helpers ---

  const assignedCertIds = new Set((userCerts ?? []).map(c => String(c.certificationId)));
  const certOptions = (allCerts ?? [])
    .filter(c => !assignedCertIds.has(String(c.id)))
    .map(c => ({ value: String(c.id), label: c.name }));

  const handleAddCert = async () => {
    if (!newCertId) return;
    setActionError(null);
    try {
      await addUserCert({
        organizationId: activeOrganizationId,
        userId: user.id,
        data: {
          certificationId: Number.parseInt(newCertId, 10),
          certificationDate: newCertDate || null,
          validUntilDate: newValidUntil || null,
        },
      }).unwrap();
      setNewCertId(null);
      setNewCertDate('');
      setNewValidUntil('');
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleRemoveCert = async (userCertificationId: number) => {
    setActionError(null);
    try {
      await removeUserCert({ organizationId: activeOrganizationId, userCertificationId }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const startEditCertDates = (
    certId: number,
    certDate: string | null,
    validUntil: string | null,
  ) => {
    setEditingCertDates(prev => ({
      ...prev,
      [certId]: {
        certificationDate: certDate ?? '',
        validUntilDate: validUntil ?? '',
      },
    }));
  };

  const cancelEditCertDates = (certId: number) => {
    setEditingCertDates(prev => {
      const next = { ...prev };
      delete next[certId];
      return next;
    });
  };

  const saveCertDates = async (userCertificationId: number) => {
    const dates = editingCertDates[userCertificationId];
    if (!dates) return;
    setActionError(null);
    try {
      await updateUserCert({
        organizationId: activeOrganizationId,
        userCertificationId,
        data: {
          certificationDate: dates.certificationDate || null,
          validUntilDate: dates.validUntilDate || null,
        },
      }).unwrap();
      cancelEditCertDates(userCertificationId);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  return (
    <Box p="md" maw={800} mx="auto">
      <Paper shadow="sm" p="lg" mb="lg">
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

      {error && (
        <Alert color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}

      {/* Work Roles */}
      <Paper shadow="sm" p="lg" mb="lg">
        <Title order={4} mb="md">
          {t('orgUsers.workRoles')}
        </Title>

        {canManage && (
          <Group align="flex-end" mb="md">
            <Select
              data={roleOptions}
              value={newRoleId}
              onChange={setNewRoleId}
              placeholder={t('orgUsers.selectRole')}
              searchable
              clearable
              style={{ flex: 1 }}
            />
            <Button onClick={handleAddRole} disabled={!newRoleId}>
              {t('common.add')}
            </Button>
          </Group>
        )}

        {(userWorkRoles ?? []).length === 0 ? (
          <Text c="dimmed">{t('orgUsers.noRoles')}</Text>
        ) : (
          <Stack gap="xs">
            {(userWorkRoles ?? []).map(r => (
              <Group key={r.id} justify="space-between">
                <Box>
                  <Text fw={500}>{r.workRoleName}</Text>
                  {r.workRoleDescription && (
                    <Text size="sm" c="dimmed">
                      {r.workRoleDescription}
                    </Text>
                  )}
                </Box>
                <Group gap="xs">
                  {canManage ? (
                    <Button
                      variant="light"
                      color={r.isQualified ? 'green' : 'gray'}
                      size="xs"
                      onClick={() => handleToggleQualified(r.id, r.isQualified)}
                      leftSection={
                        <Box
                          w={8}
                          h={8}
                          style={{
                            borderRadius: '50%',
                            backgroundColor: r.isQualified ? '#40c057' : '#adb5bd',
                          }}
                        />
                      }
                    >
                      {r.isQualified ? t('orgUsers.qualified') : t('orgUsers.notQualified')}
                    </Button>
                  ) : (
                    r.isQualified && (
                      <Badge color="green" variant="light">
                        {t('orgUsers.qualified')}
                      </Badge>
                    )
                  )}
                  {canManage && (
                    <Button
                      variant="subtle"
                      color="red"
                      size="xs"
                      onClick={() => handleRemoveRole(r.id)}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </Group>
              </Group>
            ))}
          </Stack>
        )}
      </Paper>

      {/* Certifications */}
      <Paper shadow="sm" p="lg">
        <Title order={4} mb="md">
          {t('orgUsers.certifications')}
        </Title>

        {canManage && (
          <Group align="flex-end" mb="md">
            <Select
              data={certOptions}
              value={newCertId}
              onChange={setNewCertId}
              placeholder={t('orgUsers.selectCertification')}
              searchable
              clearable
              style={{ flex: 1 }}
            />
            <TextInput
              type="date"
              label={t('orgUsers.certificationDate')}
              value={newCertDate}
              onChange={e => setNewCertDate(e.target.value)}
              placeholder=""
            />
            <TextInput
              type="date"
              label={t('orgUsers.validUntilDate')}
              value={newValidUntil}
              onChange={e => setNewValidUntil(e.target.value)}
              placeholder=""
            />
            <Button onClick={handleAddCert} disabled={!newCertId}>
              {t('orgUsers.addCertificationButton')}
            </Button>
          </Group>
        )}

        {(userCerts ?? []).length === 0 ? (
          <Text c="dimmed">{t('orgUsers.noCertifications')}</Text>
        ) : (
          <Stack gap="md">
            {(userCerts ?? []).map(c => {
              const isEditing = c.id in editingCertDates;
              const editDates = editingCertDates[c.id];
              return (
                <Box key={c.id}>
                  <Group justify="space-between">
                    <Box>
                      <Text fw={500}>{c.certificationName}</Text>
                      {!isEditing && (
                        <Text size="sm" c="dimmed">
                          {c.certificationDate &&
                            `${t('profile.certified')}: ${c.certificationDate}`}
                          {c.certificationDate && c.validUntilDate && ' | '}
                          {c.validUntilDate && `${t('profile.validUntil')}: ${c.validUntilDate}`}
                          {!c.certificationDate && !c.validUntilDate && '-'}
                        </Text>
                      )}
                    </Box>
                    <Group gap="xs">
                      {canManage && !isEditing && (
                        <Button
                          variant="subtle"
                          size="xs"
                          onClick={() =>
                            startEditCertDates(c.id, c.certificationDate, c.validUntilDate)
                          }
                        >
                          {t('common.edit')}
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          variant="subtle"
                          color="red"
                          size="xs"
                          onClick={() => handleRemoveCert(c.id)}
                        >
                          {t('common.delete')}
                        </Button>
                      )}
                    </Group>
                  </Group>
                  {canManage && isEditing && editDates && (
                    <Group align="flex-end" mt="xs">
                      <TextInput
                        type="date"
                        label={t('orgUsers.certificationDate')}
                        value={editDates.certificationDate}
                        onChange={e =>
                          setEditingCertDates(prev => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], certificationDate: e.target.value },
                          }))
                        }
                        placeholder=""
                      />
                      <TextInput
                        type="date"
                        label={t('orgUsers.validUntilDate')}
                        value={editDates.validUntilDate}
                        onChange={e =>
                          setEditingCertDates(prev => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], validUntilDate: e.target.value },
                          }))
                        }
                        placeholder=""
                      />
                      <Button size="xs" onClick={() => saveCertDates(c.id)}>
                        {t('orgUsers.saveDates')}
                      </Button>
                      <Button size="xs" variant="default" onClick={() => cancelEditCertDates(c.id)}>
                        {t('common.cancel')}
                      </Button>
                    </Group>
                  )}
                </Box>
              );
            })}
          </Stack>
        )}
      </Paper>
    </Box>
  );
}

export default OrgUserProfilePage;
