import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { isRouteErrorResponse, Link as RouterLink, useRouteError } from 'react-router-dom';

export default function ErrorPage() {
  const error = useRouteError();
  let errorMessage = 'An unexpected error has occurred.';
  if (isRouteErrorResponse(error)) {
    errorMessage = error.statusText || `${error.status}`;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: 2,
      }}
    >
      <Typography variant="h1" component="h1">
        Oops!
      </Typography>
      <Typography variant="body1">{errorMessage}</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        Go Home
      </Button>
    </Box>
  );
}
