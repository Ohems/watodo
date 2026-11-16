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
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useAddMyCertificationMutation,
  useAddMyWorkRoleMutation,
  useGetAllCertificationsQuery,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetMyCertificationsQuery,
  useGetMyWorkRolesQuery,
  useRemoveMyCertificationMutation,
  useRemoveMyWorkRoleMutation,
  useUpdateMyCertificationMutation,
} from '../../api/index.js';
import DateField from '../../components/DateField/index.js';
import { EventAssignmentsCard } from '../../components/EventAssignmentsCard/index.js';
import { QueryError } from '../../components/QueryState/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';

function ProfilePage() {
  const { t } = useTranslation();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { data: currentUser } = useGetCurrentUserQuery();

  const myRolesQuery = useGetMyWorkRolesQuery(activeOrganizationId ?? skipToken);
  const myCertsQuery = useGetMyCertificationsQuery(activeOrganizationId ?? skipToken);
  const { data: allRoles, isError: allRolesError } = useGetAllWorkRolesQuery(
    activeOrganizationId ?? skipToken,
  );
  const { data: allCerts, isError: allCertsError } = useGetAllCertificationsQuery(
    activeOrganizationId ?? skipToken,
  );

  const [addWorkRole] = useAddMyWorkRoleMutation();
  const [removeWorkRole] = useRemoveMyWorkRoleMutation();
  const [addCert] = useAddMyCertificationMutation();
  const [removeCert] = useRemoveMyCertificationMutation();
  const [updateCert] = useUpdateMyCertificationMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  // New certification form state
  const [newCertId, setNewCertId] = useState<string | null>(null);
  const [newCertDate, setNewCertDate] = useState('');
  const [newValidUntil, setNewValidUntil] = useState('');

  // Inline edit state for existing certifications (userCertificationId -> dates)
  const [editingCertDates, setEditingCertDates] = useState<
    Record<number, { certificationDate: string; validUntilDate: string }>
  >({});

  if (!currentUser) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!activeOrganizationId) {
    return (
      <Box p="md">
        <Alert color="yellow">{t('noOrganization.message')}</Alert>
      </Box>
    );
  }

  if (myRolesQuery.isLoading || myCertsQuery.isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  const assignedRoleIds = new Set((myRolesQuery.data ?? []).map(r => String(r.workRoleId)));
  const roleOptions = (allRoles ?? [])
    .filter(r => !assignedRoleIds.has(String(r.id)))
    .map(r => ({ value: String(r.id), label: r.name }));

  const assignedCertIds = new Set((myCertsQuery.data ?? []).map(c => String(c.certificationId)));
  const certOptions = (allCerts ?? [])
    .filter(c => !assignedCertIds.has(String(c.id)))
    .map(c => ({ value: String(c.id), label: c.name }));

  const handleAddRoles = async (values: string[]) => {
    setActionError(null);
    const added = values.filter(v => !selectedRoleIds.includes(v));
    setSelectedRoleIds(values);
    try {
      for (const id of added) {
        await addWorkRole({
          organizationId: activeOrganizationId,
          data: { workRoleId: Number.parseInt(id, 10) },
        }).unwrap();
      }
    } catch (err) {
      setActionError(getApiErrorMessage(err));
      setSelectedRoleIds(selectedRoleIds);
    }
  };

  const handleRemoveRole = async (userWorkRoleId: number) => {
    setActionError(null);
    try {
      await removeWorkRole({ organizationId: activeOrganizationId, userWorkRoleId }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleAddCert = async () => {
    if (!newCertId) return;
    setActionError(null);
    try {
      await addCert({
        organizationId: activeOrganizationId,
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
      await removeCert({ organizationId: activeOrganizationId, userCertificationId }).unwrap();
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
      await updateCert({
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
      <Title order={2} mb="lg">
        {t('profile.title')}
      </Title>

      {actionError && (
        <Alert color="red" variant="light" mb="md">
          {actionError}
        </Alert>
      )}

      <Paper shadow="sm" p="lg" mb="lg">
        <Title order={4} mb="md">
          {t('profile.personalInfo')}
        </Title>
        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('profile.name')}
            </Text>
            <Text>{currentUser.name}</Text>
          </Box>
          <Box>
            <Text size="sm" fw={500} c="dimmed" mb={4}>
              {t('profile.email')}
            </Text>
            <Text>{currentUser.email}</Text>
          </Box>
          {currentUser.description && (
            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('profile.description')}
              </Text>
              <Text>{currentUser.description}</Text>
            </Box>
          )}
        </Stack>
      </Paper>

      <Paper shadow="sm" p="lg" mb="lg">
        <Title order={4} mb="md">
          {t('profile.myWorkRoles')}
        </Title>
        {myRolesQuery.isError || allRolesError ? (
          <QueryError />
        ) : (
          <>
            <Text size="sm" c="dimmed" mb="md">
              {t('profile.selectRolesHint')}
            </Text>
            <MultiSelect
              data={roleOptions}
              value={selectedRoleIds}
              onChange={handleAddRoles}
              placeholder={t('profile.addRole')}
              searchable
              clearable
              mb="md"
            />
            {(myRolesQuery.data ?? []).length === 0 ? (
              <Text c="dimmed">{t('profile.noRoles')}</Text>
            ) : (
              <Stack gap="xs">
                {(myRolesQuery.data ?? []).map(r => (
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
                      {r.isQualified && (
                        <Badge color="green" variant="light">
                          {t('profile.qualified')}
                        </Badge>
                      )}
                      <Button
                        variant="subtle"
                        color="red"
                        size="xs"
                        onClick={() => handleRemoveRole(r.id)}
                      >
                        {t('common.delete')}
                      </Button>
                    </Group>
                  </Group>
                ))}
              </Stack>
            )}
          </>
        )}
      </Paper>

      <Paper shadow="sm" p="lg" mb="lg">
        <Title order={4} mb="md">
          {t('profile.myCertifications')}
        </Title>
        {myCertsQuery.isError || allCertsError ? (
          <QueryError />
        ) : (
          <>
            <Text size="sm" c="dimmed" mb="md">
              {t('profile.addCertificationHint')}
            </Text>

            <Group align="flex-end" mb="md">
              <Select
                data={certOptions}
                value={newCertId}
                onChange={setNewCertId}
                placeholder={t('profile.selectCertification')}
                searchable
                clearable
                style={{ flex: 1 }}
              />
              <DateField
                label={t('profile.certificationDate')}
                value={newCertDate}
                onChange={setNewCertDate}
              />
              <DateField
                label={t('profile.validUntilDate')}
                value={newValidUntil}
                onChange={setNewValidUntil}
              />
              <Button onClick={handleAddCert} disabled={!newCertId}>
                {t('profile.addCertificationButton')}
              </Button>
            </Group>

            {(myCertsQuery.data ?? []).length === 0 ? (
              <Text c="dimmed">{t('profile.noCertifications')}</Text>
            ) : (
              <Stack gap="md">
                {(myCertsQuery.data ?? []).map(c => {
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
                              {c.validUntilDate &&
                                `${t('profile.validUntil')}: ${c.validUntilDate}`}
                              {!c.certificationDate && !c.validUntilDate && '-'}
                            </Text>
                          )}
                        </Box>
                        <Group gap="xs">
                          {!isEditing && (
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
                          <Button
                            variant="subtle"
                            color="red"
                            size="xs"
                            onClick={() => handleRemoveCert(c.id)}
                          >
                            {t('common.delete')}
                          </Button>
                        </Group>
                      </Group>
                      {isEditing && editDates && (
                        <Group align="flex-end" mt="xs">
                          <DateField
                            label={t('profile.certificationDate')}
                            value={editDates.certificationDate}
                            onChange={value =>
                              setEditingCertDates(prev => ({
                                ...prev,
                                [c.id]: { ...prev[c.id], certificationDate: value },
                              }))
                            }
                          />
                          <DateField
                            label={t('profile.validUntilDate')}
                            value={editDates.validUntilDate}
                            onChange={value =>
                              setEditingCertDates(prev => ({
                                ...prev,
                                [c.id]: { ...prev[c.id], validUntilDate: value },
                              }))
                            }
                          />
                          <Button size="xs" onClick={() => saveCertDates(c.id)}>
                            {t('profile.saveDates')}
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            onClick={() => cancelEditCertDates(c.id)}
                          >
                            {t('common.cancel')}
                          </Button>
                        </Group>
                      )}
                    </Box>
                  );
                })}
              </Stack>
            )}
          </>
        )}
      </Paper>

      {/* Event assignments of the current user */}
      <EventAssignmentsCard organizationId={activeOrganizationId} userId={currentUser.id} />
    </Box>
  );
}

export default ProfilePage;
