import { Alert, Box, Button, Center, Loader, Paper, Stack, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { getLoginUrl, useGetAuthProvidersQuery } from '../../api/index.js';

function LoginPage() {
  const { t } = useTranslation();
  const { data, isError } = useGetAuthProvidersQuery();
  // No hardcoded fallback: the provider list always comes from the API (the
  // E2E tests mock it). A failed request means the endpoint did not respond
  // successfully (backend down or erroring), shown as a service-down message;
  // an empty list means the server is up but has no login methods configured.
  const providers = data?.providers ?? null;

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
          {isError ? (
            <Alert color="red" variant="light">
              {t('login.serviceUnavailable')}
            </Alert>
          ) : providers === null ? (
            <Loader />
          ) : providers.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('login.noProviders')}
            </Text>
          ) : (
            providers.map(provider => (
              <Button
                key={provider.id}
                component="a"
                href={getLoginUrl(provider.id, undefined, returnUrl)}
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
