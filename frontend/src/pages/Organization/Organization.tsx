import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import EditField from '../../components/EditField/EditField.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { fetchMyOrganizations, updateOrganization } from '../../store/organization-slice.js';
import type { OrganizationUpdate } from '../../types/index.js';
import NoOrganizationPage from '../NoOrganizationPage/NoOrganizationPage.js';

/** Users with any of these permissions may edit the organization. */
const EDIT_PERMISSIONS = ['admin', 'organization:write'];

function OrganizationPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const { organizations, activeOrganizationId, loaded, loading, error } = useAppSelector(
    state => state.organization,
  );

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<OrganizationUpdate>({});

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

  const handleSave = async () => {
    if (organization) {
      await dispatch(updateOrganization({ organizationId: organization.id, data: editData }));
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setEditing(false);
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
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!organization) {
    return <NoOrganizationPage />;
  }

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h4">
            {editing ? t('organization.editOrganization') : organization.name}
          </Typography>
          {canEdit && (
            <Box>
              {!editing ? (
                <Button variant="contained" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button variant="outlined" onClick={handleCancel} sx={{ mr: 1 }}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="contained" onClick={handleSave}>
                    {t('common.save')}
                  </Button>
                </>
              )}
            </Box>
          )}
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('common.name')}
            </Typography>
            <EditField
              value={editData.name ?? organization.name}
              editing={editing}
              label={t('common.name')}
              onChange={value => setEditData(prev => ({ ...prev, name: value }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('common.description')}
            </Typography>
            <EditField
              value={editData.description ?? organization.description}
              editing={editing}
              label={t('common.description')}
              onChange={value => setEditData(prev => ({ ...prev, description: value }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('organization.defaultTimezone')}
            </Typography>
            <EditField
              value={editData.defaultTimezone ?? organization.defaultTimezone}
              editing={editing}
              label={t('organization.defaultTimezone')}
              onChange={value => setEditData(prev => ({ ...prev, defaultTimezone: value }))}
            />
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}

export default OrganizationPage;
