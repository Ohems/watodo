import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconBell, IconCalendarEvent, IconCheck } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { eventsApi, notificationsApi } from '../../api/index.js';
import type { EventOccurrence, Notification } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 14;

function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [upcomingEvents, setUpcomingEvents] = useState<EventOccurrence[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const data = await notificationsApi.listNotifications({ page: 0, limit: 10 });
      setNotifications(data.items);
      setUnreadCount(data.unreadCount);
    } catch {
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const loadUpcomingEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const now = new Date();
      const end = new Date(now.getTime() + UPCOMING_DAYS * DAY_MS);
      const data = await eventsApi.getOccurrences(now, end);
      const upcoming = data
        .filter(occ => !occ.isCancelled)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .slice(0, 10);
      setUpcomingEvents(upcoming);
    } catch {
      setUpcomingEvents([]);
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    loadUpcomingEvents();
  }, [loadNotifications, loadUpcomingEvents]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      await loadNotifications();
    } catch {
      // Ignore errors
    }
  };

  const handleMarkRead = async (notification: Notification) => {
    if (notification.isRead) return;
    try {
      await notificationsApi.markRead(notification.id, true);
      await loadNotifications();
    } catch {
      // Ignore errors
    }
  };

  const handleEventClick = (occurrence: EventOccurrence) => {
    navigate(`/events/${occurrence.seriesId}`);
  };

  return (
    <Box p="md">
      <Title order={2} mb="lg">
        {t('home.title')}
      </Title>

      <Stack gap="lg">
        {/* Notifications card */}
        <Card shadow="sm" withBorder>
          <Group justify="space-between" mb="md">
            <Group gap="xs">
              <IconBell size={20} />
              <Title order={4}>{t('home.notifications')}</Title>
              {unreadCount > 0 && (
                <Badge color="red" variant="filled" size="sm">
                  {unreadCount} {t('home.unread')}
                </Badge>
              )}
            </Group>
            {unreadCount > 0 && (
              <Button variant="subtle" size="sm" onClick={handleMarkAllRead}>
                {t('home.markAllRead')}
              </Button>
            )}
          </Group>
          {loadingNotifications ? (
            <Center p="md">
              <Loader size="sm" />
            </Center>
          ) : notifications.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('home.noNotifications')}
            </Text>
          ) : (
            <Stack gap="xs">
              {notifications.map(notification => (
                <Group
                  key={notification.id}
                  justify="space-between"
                  wrap="nowrap"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 4,
                    backgroundColor: notification.isRead
                      ? 'transparent'
                      : 'var(--mantine-color-blue-0)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleMarkRead(notification)}
                >
                  <Box style={{ flex: 1 }}>
                    <Text size="sm" fw={notification.isRead ? 400 : 600}>
                      {notification.title}
                    </Text>
                    {notification.body && (
                      <Text size="xs" c="dimmed">
                        {notification.body}
                      </Text>
                    )}
                    <Text size="xs" c="dimmed">
                      {new Date(notification.createdAt).toLocaleString()}
                    </Text>
                  </Box>
                  {!notification.isRead && (
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={() => handleMarkRead(notification)}
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                  )}
                </Group>
              ))}
            </Stack>
          )}
        </Card>

        {/* Upcoming events card */}
        <Card shadow="sm" withBorder>
          <Group gap="xs" mb="md">
            <IconCalendarEvent size={20} />
            <Title order={4}>{t('home.upcomingEvents')}</Title>
          </Group>
          {loadingEvents ? (
            <Center p="md">
              <Loader size="sm" />
            </Center>
          ) : upcomingEvents.length === 0 ? (
            <Text c="dimmed" size="sm">
              {t('home.noUpcomingEvents')}
            </Text>
          ) : (
            <Stack gap="xs">
              {upcomingEvents.map(occ => (
                <Group
                  key={`${occ.seriesId}-${occ.occurrenceStart}`}
                  justify="space-between"
                  wrap="nowrap"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    border: '1px solid var(--mantine-color-gray-2)',
                  }}
                  onClick={() => handleEventClick(occ)}
                >
                  <Box>
                    <Text size="sm" fw={500}>
                      {occ.title}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {occ.isAllDay
                        ? new Date(occ.start).toLocaleDateString()
                        : new Date(occ.start).toLocaleString()}
                    </Text>
                  </Box>
                  {occ.isRescheduled && (
                    <Badge size="sm" variant="light" color="orange">
                      {t('events.rescheduled')}
                    </Badge>
                  )}
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>
    </Box>
  );
}

export default Home;
