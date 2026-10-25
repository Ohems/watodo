import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

export default function NoOrganizationPage() {
  const { t } = useTranslation();
  return (
    <Center style={{ minHeight: '60vh', padding: 16 }}>
      <Stack align="center" gap="md">
        <Title order={2}>{t('noOrganization.title')}</Title>
        <Text c="dimmed">{t('noOrganization.message')}</Text>
        <Button component={RouterLink} to="/" variant="filled">
          {t('noOrganization.goHome')}
        </Button>
      </Stack>
    </Center>
  );
}
