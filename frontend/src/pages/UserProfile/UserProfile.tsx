import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import EditField from '../../components/EditField/EditField.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { clearError, fetchUsers, updateUser } from '../../store/user-slice.js';
import type { UserPush } from '../../types/index.js';

function UserProfile() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { users, loading, error } = useAppSelector(state => state.user);

  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<UserPush>({});

  const user = users.find(u => u.id === userId);
  const isNew = userId === 'new';

  useEffect(() => {
    if (!isNew && users.length === 0) dispatch(fetchUsers({}));
    if (!isNew && user) {
      setEditData({
        name: user.name,
        email: user.email,
        description: user.description,
        state: user.state,
      });
    }
  }, [dispatch, isNew, user, users.length]);

  useEffect(() => {
    return () => {
      dispatch(clearError());
    };
  }, [dispatch]);

  const handleSave = async () => {
    if (user) await dispatch(updateUser({ userId: user.id, data: editData }));
    setEditing(false);
  };

  if (loading && !user) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2, maxWidth: 600, mx: 'auto' }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="h4">
            {isNew
              ? t('userProfile.newUser')
              : editing
                ? t('userProfile.editUser')
                : (user?.name ?? t('userProfile.title'))}
          </Typography>
          {!isNew && (
            <Box>
              {!editing ? (
                <Button variant="contained" onClick={() => setEditing(true)}>
                  {t('common.edit')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outlined"
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
                    sx={{ mr: 1 }}
                  >
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
              value={editData.name ?? user?.name ?? ''}
              editing={editing || isNew}
              label={t('common.name')}
              onChange={v => setEditData(p => ({ ...p, name: v }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('common.email')}
            </Typography>
            <EditField
              value={editData.email ?? user?.email ?? ''}
              editing={editing || isNew}
              label={t('common.email')}
              onChange={v => setEditData(p => ({ ...p, email: v }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('common.description')}
            </Typography>
            <EditField
              value={editData.description ?? user?.description ?? ''}
              editing={editing || isNew}
              label={t('common.description')}
              onChange={v => setEditData(p => ({ ...p, description: v }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('userProfile.permissions')}
            </Typography>
            <Typography variant="body1">
              {user?.permissions?.length ? user.permissions.join(', ') : t('common.none')}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              {t('userProfile.state')}
            </Typography>
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
        </Box>

        {!isNew && (
          <Box sx={{ mt: 3 }}>
            <Button variant="text" onClick={() => navigate('/users')}>
              {t('userProfile.backToList')}
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default UserProfile;
