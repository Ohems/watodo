import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import EditField from '../../components/EditField/EditField.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { clearError, fetchUsers, updateUser } from '../../store/user-slice.js';
import type { UserPush } from '../../types/index.js';

function UserProfile() {
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
            {isNew ? 'New User' : editing ? 'Edit User' : (user?.name ?? 'User Profile')}
          </Typography>
          {!isNew && (
            <Box>
              {!editing ? (
                <Button variant="contained" onClick={() => setEditing(true)}>
                  Edit
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
                    Cancel
                  </Button>
                  <Button variant="contained" onClick={handleSave}>
                    Save
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
              Name
            </Typography>
            <EditField
              value={editData.name ?? user?.name ?? ''}
              editing={editing || isNew}
              label="Name"
              onChange={v => setEditData(p => ({ ...p, name: v }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Email
            </Typography>
            <EditField
              value={editData.email ?? user?.email ?? ''}
              editing={editing || isNew}
              label="Email"
              onChange={v => setEditData(p => ({ ...p, email: v }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Description
            </Typography>
            <EditField
              value={editData.description ?? user?.description ?? ''}
              editing={editing || isNew}
              label="Description"
              onChange={v => setEditData(p => ({ ...p, description: v }))}
            />
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Permissions
            </Typography>
            <Typography variant="body1">
              {user?.permissions?.length ? user.permissions.join(', ') : 'None'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              State
            </Typography>
            <EditField
              value={editData.state ?? user?.state ?? 'active'}
              editing={editing || isNew}
              label="State"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
              ]}
              onChange={v => setEditData(p => ({ ...p, state: v as 'active' | 'inactive' }))}
            />
          </Box>
        </Box>

        {!isNew && (
          <Box sx={{ mt: 3 }}>
            <Button variant="text" onClick={() => navigate('/users')}>
              Back to list
            </Button>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

export default UserProfile;
