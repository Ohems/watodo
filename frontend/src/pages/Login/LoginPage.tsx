import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/index.js';
import type { AuthProviderInfo } from '../../types/index.js';

// Used when the provider list cannot be fetched from the API.
const FALLBACK_PROVIDERS: AuthProviderInfo[] = [
  { id: 'discord', name: 'Discord', configured: false },
  { id: 'google', name: 'Google', configured: false },
  { id: 'microsoft', name: 'Microsoft', configured: false },
];

function LoginPage() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<AuthProviderInfo[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getProviders()
      .then(data => {
        if (!cancelled) setProviders(data.providers);
      })
      .catch(() => {
        if (!cancelled) setProviders(FALLBACK_PROVIDERS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The backend redirects back here after the provider callback.
  const returnUrl = window.location.href;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Paper
        sx={{
          width: '100%',
          maxWidth: 400,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            bgcolor: 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            py: 4,
          }}
        >
          <Box
            component="img"
            src="/logo_white.svg"
            alt={t('login.logoAlt')}
            sx={{ display: 'block', width: 200, height: 'auto' }}
          />
        </Box>
        <Box
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Typography variant="body1" color="text.secondary">
            {t('login.signInToContinue')}
          </Typography>
          {providers === null ? (
            <CircularProgress />
          ) : (
            providers.map(provider => (
              <Button
                key={provider.id}
                component="a"
                href={authApi.loginUrl(provider.id, undefined, returnUrl)}
                variant="outlined"
                fullWidth
              >
                {t('login.signInWith', { provider: provider.name })}
              </Button>
            ))
          )}
        </Box>
      </Paper>
    </Box>
  );
}

export default LoginPage;
