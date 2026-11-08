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
import {
  IconBell,
  IconCalendarEvent,
  IconCalendarPlus,
  IconCheck,
  IconMinus,
} from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  useGetNotificationsQuery,
  useGetOccurrencesQuery,
  useMarkAllNotificationsReadMutation,
  useMarkNotificationReadMutation,
} from '../../api/index.js';
import { AbsenceDialog } from '../../components/AbsenceDialog/index.js';
import type { EventOccurrence, Notification, OccurrenceSlotStatus } from '../../types/index.js';
import { occurrenceRef } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DAYS = 14;

/** Slot status indicator: filled/total slots, red when a critical slot is unfilled. */
function SlotStatusBadge({ slots }: { slots: OccurrenceSlotStatus[] }) {
  const { t } = useTranslation();
  const filled = slots.filter(s => s.assigneeCount > 0).length;
  const hasUnfilledCritical = slots.some(s => s.isCritical && s.assigneeCount === 0);
  return (
    <Badge
      size="sm"
      variant="light"
      color={hasUnfilledCritical ? 'red' : filled === slots.length ? 'green' : 'yellow'}
      title={hasUnfilledCritical ? t('home.slotsUnfilledCritical') : undefined}
    >
      {t('home.slotsFilled', { filled, total: slots.length })}
    </Badge>
  );
}

function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // The range is fixed for the lifetime of the page so the query cache key
  // stays stable.
  const [range] = useState(() => {
    const now = new Date();
    return {
      start: now.toISOString(),
      end: new Date(now.getTime() + UPCOMING_DAYS * DAY_MS).toISOString(),
    };
  });

  const { data: notificationsData, isLoading: loadingNotifications } = useGetNotificationsQuery({
    page: 0,
    limit: 10,
  });
  // Only show occurrences the current user is involved in: either assigned to
  // a work role slot (participant) or managing the series via a connected
  // team (manager).
  const { data: occurrencesData, isLoading: loadingEvents } = useGetOccurrencesQuery({
    ...range,
    filter: { scope: 'involved' },
  });
  const [markAllRead] = useMarkAllNotificationsReadMutation();
  const [markRead] = useMarkNotificationReadMutation();
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);

  const quickActions = [
    {
      label: t('home.quickAddAbsence'),
      icon: <IconMinus size={16} />,
      onClick: () => setAbsenceDialogOpen(true),
    },
    {
      label: t('home.quickNewEvent'),
      icon: <IconCalendarPlus size={16} />,
      onClick: () => navigate('/events/management'),
    },
    {
      label: t('home.quickCalendar'),
      icon: <IconCalendarEvent size={16} />,
      onClick: () => navigate('/events/calendar'),
    },
  ];

  const notifications = notificationsData?.items ?? [];
  const unreadCount = notificationsData?.unreadCount ?? 0;
  const upcomingEvents = useMemo(
    () =>
      (occurrencesData ?? [])
        .filter(occ => !occ.isCancelled)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .slice(0, 10),
    [occurrencesData],
  );

  const handleMarkAllRead = async () => {
    try {
      await markAllRead().unwrap();
    } catch {
      // Ignore errors
    }
  };

  const handleMarkRead = async (notification: Notification) => {
    if (notification.isRead) return;
    try {
      await markRead({ notificationId: notification.id, isRead: true }).unwrap();
    } catch {
      // Ignore errors
    }
  };

  const handleEventClick = (occurrence: EventOccurrence) => {
    navigate(`/events/occurrences/${encodeURIComponent(occurrenceRef(occurrence))}`);
  };

  return (
    <Box p="md">
      <Title order={2} mb="lg">
        {t('home.title')}
      </Title>

      <Stack gap="lg">
        {/* Quick actions */}
        <Group gap="sm">
          {quickActions.map(action => (
            <Button
              key={action.label}
              variant="light"
              leftSection={action.icon}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          ))}
        </Group>

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
                    <Group gap="xs" wrap="nowrap">
                      <Text size="xs" c="dimmed">
                        {new Date(notification.createdAt).toLocaleString()}
                      </Text>
                      {notification.organizationName && (
                        <Badge size="xs" variant="light" color="gray">
                          {notification.organizationName}
                        </Badge>
                      )}
                    </Group>
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
                  <Group
                    gap="xs"
                    wrap="wrap"
                    style={{ flex: '0 1 auto', maxWidth: '60%', justifyContent: 'flex-end' }}
                  >
                    {occ.managedUnfilledCriticalSlots.length > 0 && (
                      <Badge size="sm" variant="filled" color="red">
                        {t('home.missingManagedCritical', {
                          slots: occ.managedUnfilledCriticalSlots.join(', '),
                        })}
                      </Badge>
                    )}
                    {occ.workRoleSlots.length > 0 && <SlotStatusBadge slots={occ.workRoleSlots} />}
                    {occ.isParticipant && (
                      <Badge size="sm" variant="light" color="green">
                        {t('home.participant')}
                      </Badge>
                    )}
                    {occ.isManager && (
                      <Badge size="sm" variant="light" color="violet">
                        {t('home.manager')}
                      </Badge>
                    )}
                    {occ.isRescheduled && (
                      <Badge size="sm" variant="light" color="orange">
                        {t('events.rescheduled')}
                      </Badge>
                    )}
                    <Badge size="sm" variant="light" color="blue">
                      {occ.organizationName}
                    </Badge>
                  </Group>
                </Group>
              ))}
            </Stack>
          )}
        </Card>
      </Stack>

      <AbsenceDialog
        opened={absenceDialogOpen}
        absence={null}
        onClose={() => setAbsenceDialogOpen(false)}
      />
    </Box>
  );
}

export default Home;
