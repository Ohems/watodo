import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

export default function NoOrganizationPage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: 2,
        p: 4,
      }}
    >
      <Typography variant="h3">No Organization</Typography>
      <Typography variant="body1" color="text.secondary">
        You are not a member of any organization yet. Please contact an administrator to be added to
        one.
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Go home
      </Button>
    </Box>
  );
}
