import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

export default function NoOrganizationPage() {
  const { t } = useTranslation();
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
      <Typography variant="h3">{t('noOrganization.title')}</Typography>
      <Typography variant="body1" color="text.secondary">
        {t('noOrganization.message')}
      </Typography>
      <Button component={RouterLink} to="/" variant="contained">
        {t('noOrganization.goHome')}
      </Button>
    </Box>
  );
}
