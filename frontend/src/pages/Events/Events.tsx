import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Center,
  Group,
  Loader,
  Modal,
  Paper,
  Select,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { calendarsApi, eventsApi, organizationsApi } from '../../api/index.js';
import EventSeriesDialog from '../../components/EventSeriesDialog/EventSeriesDialog.js';
import { useAppSelector } from '../../hooks/redux.js';
import type { Calendar, EventSeries, Organization, RecurrenceInput } from '../../types/index.js';

function Events() {
  const { t } = useTranslation();
  const currentUser = useAppSelector(state => state.user.currentUser);
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const [series, setSeries] = useState<EventSeries[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<EventSeries | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventSeries | null>(null);

  const [newCalendarName, setNewCalendarName] = useState('');
  const [newCalendarOrganizationId, setNewCalendarOrganizationId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [seriesData, calendarsData, organizationsData] = await Promise.all([
        eventsApi.getEventSeries(),
        calendarsApi.getCalendars(),
        organizationsApi.getMyOrganizations(),
      ]);
      setSeries(seriesData);
      setCalendars(calendarsData);
      setOrganizations(organizationsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const calendarName = (calendarId: string) =>
    calendars.find(calendar => calendar.id === calendarId)?.name ?? calendarId;

  const describeRecurrence = (recurrence: RecurrenceInput | null): string => {
    if (!recurrence) return t('events.noRecurrence');
    const freqLabels: Record<string, string> = {
      DAILY: t('events.freqDaily'),
      WEEKLY: t('events.freqWeekly'),
      MONTHLY: t('events.freqMonthly'),
      YEARLY: t('events.freqYearly'),
    };
    let text = freqLabels[recurrence.freq] ?? recurrence.freq;
    if (recurrence.interval && recurrence.interval > 1) {
      text = `${recurrence.interval}x ${text}`;
    }
    return text;
  };

  const handleCreateCalendar = async () => {
    setError(null);
    try {
      await calendarsApi.createCalendar({
        name: newCalendarName.trim(),
        organizationId: newCalendarOrganizationId,
      });
      setNewCalendarName('');
      setNewCalendarOrganizationId('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setError(null);
    try {
      await eventsApi.deleteEventSeries(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Box p="md">
      <Group gap="md" mb="md">
        <Title order={3}>{t('events.title')}</Title>
        {canWrite && (
          <Button
            variant="filled"
            leftSection={<IconPlus size={16} />}
            disabled={calendars.length === 0}
            onClick={() => {
              setEditingSeries(null);
              setDialogOpen(true);
            }}
          >
            {t('events.newSeries')}
          </Button>
        )}
      </Group>
      {error && (
        <Alert color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}
      {calendars.length === 0 && canWrite && (
        <Paper shadow="sm" p="md" mb="md">
          <Title order={5}>{t('events.createCalendar')}</Title>
          <Group gap="sm" mt="sm" wrap="wrap">
            <TextInput
              size="sm"
              placeholder={t('events.calendarName')}
              value={newCalendarName}
              onChange={event => setNewCalendarName(event.target.value)}
            />
            <Select
              size="sm"
              placeholder={t('events.organization')}
              data={organizations.map(org => ({ value: org.id, label: org.name }))}
              value={newCalendarOrganizationId || null}
              onChange={value => setNewCalendarOrganizationId(value ?? '')}
              style={{ minWidth: 200 }}
            />
            <Button
              variant="outline"
              disabled={!newCalendarName.trim() || !newCalendarOrganizationId}
              onClick={handleCreateCalendar}
            >
              {t('events.createCalendar')}
            </Button>
          </Group>
        </Paper>
      )}
      <Paper shadow="sm" withBorder>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('events.seriesTitle')}</Table.Th>
              <Table.Th>{t('events.calendar')}</Table.Th>
              <Table.Th>{t('events.start')}</Table.Th>
              <Table.Th>{t('events.durationMinutes')}</Table.Th>
              <Table.Th>{t('events.recurrence')}</Table.Th>
              {canWrite && (
                <Table.Th style={{ textAlign: 'right' }}>{t('events.actions')}</Table.Th>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {series.map(row => (
              <Table.Tr key={row.id}>
                <Table.Td>{row.title}</Table.Td>
                <Table.Td>{calendarName(row.calendarId)}</Table.Td>
                <Table.Td>{new Date(row.start).toLocaleString()}</Table.Td>
                <Table.Td>{row.durationMinutes}</Table.Td>
                <Table.Td>{describeRecurrence(row.recurrence)}</Table.Td>
                {canWrite && (
                  <Table.Td style={{ textAlign: 'right' }}>
                    <ActionIcon
                      variant="subtle"
                      aria-label={t('common.edit')}
                      onClick={() => {
                        setEditingSeries(row);
                        setDialogOpen(true);
                      }}
                    >
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label={t('events.deleteSeries')}
                      onClick={() => setDeleteTarget(row)}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Table.Td>
                )}
              </Table.Tr>
            ))}
            {series.length === 0 && (
              <Table.Tr>
                <Table.Td colSpan={canWrite ? 6 : 5} style={{ textAlign: 'center' }}>
                  {t('events.noSeries')}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Paper>
      <EventSeriesDialog
        open={dialogOpen}
        series={editingSeries}
        calendars={calendars}
        organizations={organizations}
        onClose={() => setDialogOpen(false)}
        onSaved={load}
      />
      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={t('events.deleteSeries')}
      >
        <Text size="sm">
          {t('events.deleteSeriesConfirm', { title: deleteTarget?.title ?? '' })}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setDeleteTarget(null)}>
            {t('common.cancel')}
          </Button>
          <Button color="red" variant="filled" onClick={handleDelete}>
            {t('events.deleteSeries')}
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

export default Events;
