import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link as RouterLink, useRouteError } from 'react-router-dom';

export default function ErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  let errorMessage = t('error.unexpected');
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
        {t('error.oops')}
      </Typography>
      <Typography variant="body1">{errorMessage}</Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t('error.goHome')}
      </Button>
    </Box>
  );
}
