import { Alert, Box, Paper, Switch, Table, Text, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useDeletePushSubscriptionMutation,
  useGetNotificationPreferencesQuery,
  useGetPushSubscriptionsQuery,
  useGetVapidPublicKeyQuery,
  useRegisterPushSubscriptionMutation,
  useUpdateNotificationPreferenceMutation,
} from '../../api/index.js';
import { QueryState } from '../../components/QueryState/index.js';
import { isPushSupported, subscribeToPush, unsubscribeFromPush } from '../../push.js';
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
 * Push notification section of the notification settings: a single switch
 * that subscribes/unsubscribes this browser via the service worker and
 * registers/removes the endpoint on the backend. Shown with an explanatory
 * hint when the browser does not support push, the server has no VAPID key
 * configured, or notification permission was denied.
 */
function PushSection() {
  const { t } = useTranslation();
  const supported = isPushSupported();
  const vapidQuery = useGetVapidPublicKeyQuery(undefined, { skip: !supported });
  const subscriptionsQuery = useGetPushSubscriptionsQuery(undefined, { skip: !supported });
  const [register] = useRegisterPushSubscriptionMutation();
  const [unregister] = useDeletePushSubscriptionMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!supported) {
    return (
      <Box mb="lg">
        <Title order={6} mb="sm">
          {t('account.notificationSettings.pushSection')}
        </Title>
        <Text size="sm" c="dimmed">
          {t('account.notificationSettings.pushNotSupported')}
        </Text>
      </Box>
    );
  }

  const vapidKey = vapidQuery.data?.publicKey ?? '';
  const subscribed = (subscriptionsQuery.data?.length ?? 0) > 0;
  const permissionDenied =
    typeof Notification !== 'undefined' && Notification.permission === 'denied';

  const handleChange = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        const json = await subscribeToPush(vapidKey);
        await register({ ...json, userAgent: navigator.userAgent }).unwrap();
      } else {
        const endpoint = await unsubscribeFromPush();
        const subscription = subscriptionsQuery.data?.find(s => s.endpoint === endpoint);
        if (subscription) await unregister(subscription.id).unwrap();
      }
    } catch (changeError) {
      if (changeError instanceof Error && changeError.message === 'permission-denied') {
        setError(t('account.notificationSettings.pushPermissionDenied'));
      } else {
        setError(
          getApiErrorMessage(changeError) || t('account.notificationSettings.pushEnableFailed'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box mb="lg">
      <Title order={6} mb="sm">
        {t('account.notificationSettings.pushSection')}
      </Title>
      {vapidQuery.isLoading || subscriptionsQuery.isLoading ? null : !vapidKey ? (
        <Text size="sm" c="dimmed">
          {t('account.notificationSettings.pushNotConfigured')}
        </Text>
      ) : (
        <>
          <Switch
            aria-label={t('account.notificationSettings.pushEnable')}
            checked={subscribed}
            disabled={busy || permissionDenied}
            onChange={event => void handleChange(event.currentTarget.checked)}
          />
          {permissionDenied && (
            <Text size="xs" c="red" mt="xs">
              {t('account.notificationSettings.pushPermissionDenied')}
            </Text>
          )}
          {error && (
            <Text size="xs" c="red" mt="xs">
              {error}
            </Text>
          )}
        </>
      )}
    </Box>
  );
}

/**
 * Notification settings card on the Account page: web push on/off for this
 * device, then one row per notification type (message key of the backend
 * catalog) and one toggle per delivery channel, grouped into "General" (sent
 * to everyone) and "Management" (sent only to event/team managers). Email
 * delivery is not implemented yet, but the toggles are saved already.
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
      <PushSection />
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
