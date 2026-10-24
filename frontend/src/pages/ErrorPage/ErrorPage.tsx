import { Button, Center, Stack, Text, Title } from '@mantine/core';
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
    <Center style={{ minHeight: '100vh' }}>
      <Stack align="center" gap="md">
        <Title order={1}>{t('error.oops')}</Title>
        <Text>{errorMessage}</Text>
        <Button component={RouterLink} to="/" variant="filled">
          {t('error.goHome')}
        </Button>
      </Stack>
    </Center>
  );
}
