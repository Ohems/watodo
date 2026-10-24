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
import EditField from '../../components/EditField/EditField.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { fetchMyOrganizations, updateOrganization } from '../../store/organization-slice.js';
import type { FieldErrors, OrganizationUpdate } from '../../types/index.js';
import { validateOrganizationUpdate } from '../../validation.js';
import NoOrganizationPage from '../NoOrganizationPage/NoOrganizationPage.js';

const EDIT_PERMISSIONS = ['admin', 'organization:write'];

function OrgGeneralPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const { organizations, activeOrganizationId, loaded, loading, error } = useAppSelector(
    state => state.organization,
  );

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<OrganizationUpdate>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const organization = organizations.find(org => org.id === activeOrganizationId) ?? null;
  const canEdit =
    currentUser?.permissions.some(permission => EDIT_PERMISSIONS.includes(permission)) ?? false;

  useEffect(() => {
    if (!loaded && !loading) dispatch(fetchMyOrganizations());
  }, [dispatch, loaded, loading]);

  useEffect(() => {
    if (organization) {
      setEditData({
        name: organization.name,
        description: organization.description,
        defaultTimezone: organization.defaultTimezone,
      });
    }
  }, [organization]);

  const updateField = (field: keyof OrganizationUpdate, value: string) => {
    setEditData(prev => ({ ...prev, [field]: value }));
    setFieldErrors(prev => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSave = async () => {
    if (!organization) return;
    const validationErrors = validateOrganizationUpdate(editData, t);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      return;
    }
    try {
      await dispatch(
        updateOrganization({ organizationId: organization.id, data: editData }),
      ).unwrap();
      setEditing(false);
      setFieldErrors({});
    } catch {
      // The frontend validation catches invalid fields before the request is
      // sent; a rejection here is unexpected.
    }
  };

  const handleCancel = () => {
    setEditing(false);
    setFieldErrors({});
    if (organization) {
      setEditData({
        name: organization.name,
        description: organization.description,
        defaultTimezone: organization.defaultTimezone,
      });
    }
  };

  if (!loaded || (loading && !organization)) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!organization) {
    return <NoOrganizationPage />;
  }

  return (
    <Box p="md" maw={600} mx="auto">
      <Paper shadow="sm" p="lg">
        <Group justify="space-between" mb="md">
          <Title order={3}>
            {editing ? t('organization.editOrganization') : organization.name}
          </Title>
          {canEdit && (
            <Group>
              {!editing ? (
                <Button
                  variant="filled"
                  onClick={() => {
                    setFieldErrors({});
                    setEditing(true);
                  }}
                >
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button variant="default" onClick={handleCancel}>
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
            {error}
          </Alert>
        )}

        <Stack gap="md">
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.name ? 'red' : 'dimmed'} mb={4}>
              {t('common.name')}
            </Text>
            <EditField
              value={editData.name ?? organization.name}
              editing={editing}
              label={t('common.name')}
              error={fieldErrors.name}
              onChange={value => updateField('name', value)}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.description ? 'red' : 'dimmed'} mb={4}>
              {t('common.description')}
            </Text>
            <EditField
              value={editData.description ?? organization.description}
              editing={editing}
              label={t('common.description')}
              error={fieldErrors.description}
              onChange={value => updateField('description', value)}
            />
          </Box>
          <Box>
            <Text size="sm" fw={500} c={fieldErrors.defaultTimezone ? 'red' : 'dimmed'} mb={4}>
              {t('organization.defaultTimezone')}
            </Text>
            <EditField
              value={editData.defaultTimezone ?? organization.defaultTimezone}
              editing={editing}
              label={t('organization.defaultTimezone')}
              error={fieldErrors.defaultTimezone}
              onChange={value => updateField('defaultTimezone', value)}
            />
          </Box>
        </Stack>
      </Paper>
    </Box>
  );
}

export default OrgGeneralPage;
