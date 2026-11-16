import { Alert, Box, Paper, Switch, Table, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useGetNotificationPreferencesQuery,
  useUpdateNotificationPreferenceMutation,
} from '../../api/index.js';
import { QueryState } from '../../components/QueryState/index.js';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationPreference,
  NotificationPreferencesResponse,
} from '../../types/index.js';

/** Display order of the settings categories. */
const CATEGORY_ORDER: NotificationCategory[] = ['general', 'management'];

/** i18n key of a channel under account.notificationSettings.channels. */
function channelKey(channel: NotificationChannel): string {
  return channel === 'in_app' ? 'inApp' : channel;
}

/** i18n key of a category under account.notificationSettings.categories. */
function categoryKey(category: NotificationCategory): string {
  return category;
}

interface PreferenceTableProps {
  data: NotificationPreferencesResponse;
  messageKeys: string[];
  onToggle: (messageKey: string, channel: NotificationChannel, enabled: boolean) => void;
}

/** One table of toggle switches: rows are notification types, columns channels. */
function PreferenceTable({ data, messageKeys, onToggle }: PreferenceTableProps) {
  const { t } = useTranslation();
  return (
    <Table striped highlightOnHover withTableBorder>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{t('account.notificationSettings.type')}</Table.Th>
          {data.channels.map((channel: NotificationChannel) => (
            <Table.Th key={channel}>
              {t(`account.notificationSettings.channels.${channelKey(channel)}`)}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {messageKeys.map(messageKey => (
          <Table.Tr key={messageKey}>
            <Table.Td>{t(`account.notificationSettings.types.${messageKey}`)}</Table.Td>
            {data.channels.map((channel: NotificationChannel) => {
              const preference = data.preferences.find(
                (p: NotificationPreference) => p.messageKey === messageKey && p.channel === channel,
              );
              const label = `${t(`account.notificationSettings.types.${messageKey}`)} - ${t(`account.notificationSettings.channels.${channelKey(channel)}`)}`;
              return (
                <Table.Td key={channel}>
                  <Switch
                    aria-label={label}
                    checked={preference?.enabled ?? false}
                    onChange={event => onToggle(messageKey, channel, event.currentTarget.checked)}
                  />
                </Table.Td>
              );
            })}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

/**
 * Notification settings card on the Account page: one row per notification
 * type (message key of the backend catalog) and one toggle per delivery
 * channel, grouped into "General" (sent to everyone) and "Management" (sent
 * only to event/team managers). Email and push delivery is not implemented
 * yet, but the toggles are saved already.
 */
export default function NotificationSettingsCard() {
  const { t } = useTranslation();
  const preferencesQuery = useGetNotificationPreferencesQuery();
  const [updatePreference] = useUpdateNotificationPreferenceMutation();
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async (
    messageKey: string,
    channel: NotificationChannel,
    enabled: boolean,
  ) => {
    setError(null);
    try {
      await updatePreference({ messageKey, channel, enabled }).unwrap();
    } catch (updateError) {
      setError(getApiErrorMessage(updateError) || t('account.notificationSettings.updateFailed'));
    }
  };

  // The distinct message keys per category, in the order the backend returns.
  const keysByCategory = useMemo(() => {
    const grouped = new Map<NotificationCategory, string[]>();
    for (const category of CATEGORY_ORDER) grouped.set(category, []);
    for (const preference of preferencesQuery.data?.preferences ?? []) {
      const list = grouped.get(preference.category);
      if (list && !list.includes(preference.messageKey)) list.push(preference.messageKey);
    }
    return grouped;
  }, [preferencesQuery.data]);

  return (
    <Paper shadow="sm" p="lg" mt="lg">
      <Title order={5} mb="xs">
        {t('account.notificationSettings.title')}
      </Title>
      <Text size="sm" c="dimmed" mb="md">
        {t('account.notificationSettings.description')}
      </Text>
      {error && (
        <Alert color="red" variant="light" mb="md" withCloseButton onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      <QueryState<NotificationPreferencesResponse> query={preferencesQuery}>
        {data => (
          <>
            {CATEGORY_ORDER.map(category => {
              const messageKeys = keysByCategory.get(category) ?? [];
              if (messageKeys.length === 0) return null;
              return (
                <Box key={category} mb="lg">
                  <Title order={6} mb="sm">
                    {t(`account.notificationSettings.categories.${categoryKey(category)}`)}
                  </Title>
                  <PreferenceTable
                    data={data}
                    messageKeys={messageKeys}
                    onToggle={(messageKey, channel, enabled) =>
                      void handleToggle(messageKey, channel, enabled)
                    }
                  />
                </Box>
              );
            })}
          </>
        )}
      </QueryState>
    </Paper>
  );
}
