import { Box, Button, Center, Loader, Paper, Stack, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authApi } from '../../api/index.js';
import type { AuthProviderInfo } from '../../types/index.js';

/** Used when the provider list cannot be fetched from the API. */
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
    <Center style={{ minHeight: '100vh', padding: 16 }}>
      <Paper shadow="md" style={{ width: '100%', maxWidth: 400 }}>
        <Box
          style={{
            backgroundColor: 'var(--mantine-color-blue-7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 0',
          }}
        >
          <Box
            component="img"
            src="/logo_white.svg"
            alt={t('login.logoAlt')}
            style={{ display: 'block', width: 200, height: 'auto' }}
          />
        </Box>
        <Stack align="center" gap="md" p="xl">
          <Text c="dimmed">{t('login.signInToContinue')}</Text>
          {providers === null ? (
            <Loader />
          ) : (
            providers.map(provider => (
              <Button
                key={provider.id}
                component="a"
                href={authApi.loginUrl(provider.id, undefined, returnUrl)}
                variant="outline"
                fullWidth
              >
                {t('login.signInWith', { provider: provider.name })}
              </Button>
            ))
          )}
        </Stack>
      </Paper>
    </Center>
  );
}

export default LoginPage;
