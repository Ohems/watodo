import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation } from 'react-router-dom';

export default function ErrorPage() {
  const { t } = useTranslation();
  const location = useLocation();
  return (
    <Center style={{ minHeight: '100vh' }}>
      <Stack align="center" gap="md">
        <Title order={1}>{t('error.oops')}</Title>
        <Text>{t('error.notFound', { path: location.pathname })}</Text>
        <Button component={RouterLink} to="/" variant="filled">
          {t('error.goHome')}
        </Button>
      </Stack>
    </Center>
  );
}
