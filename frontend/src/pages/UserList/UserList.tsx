import PersonAddIcon from '@mui/icons-material/PersonAdd';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserCard from '../../components/UserCard/UserCard.js';
import { useAppDispatch, useAppSelector } from '../../hooks/redux.js';
import { fetchUsers } from '../../store/user-slice.js';

function UserList() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { users, loading, error } = useAppSelector(state => state.user);

  useEffect(() => {
    dispatch(fetchUsers({ page: 0, limit: 50 }));
  }, [dispatch]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" gutterBottom>
        Contacts
      </Typography>
      <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
        <UserCard onClick={() => navigate('/users/new')}>
          <PersonAddIcon sx={{ fontSize: 36, mb: 1 }} />
          <Typography variant="body2">Add new user</Typography>
        </UserCard>
        {users.map(user => (
          <UserCard key={user.id} onClick={() => navigate(`/users/${user.id}`)}>
            <Typography variant="body1">{user.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {user.email}
            </Typography>
          </UserCard>
        ))}
      </Box>
    </Box>
  );
}

export default UserList;
