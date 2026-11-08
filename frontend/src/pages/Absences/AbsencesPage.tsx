import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Group,
  Loader,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useDeleteAbsenceMutation,
  useGetMyAbsencesQuery,
} from '../../api/index.js';
import { AbsenceDialog } from '../../components/AbsenceDialog/index.js';
import Calendar, { type CalendarEvent } from '../../components/Calendar/Calendar.js';
import type { Absence, AbsenceType } from '../../types/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Badge color per absence type. */
const TYPE_COLORS: Record<AbsenceType, string> = {
  sick: 'red',
  away: 'blue',
  other: 'gray',
};

/**
 * Personal absences page: a calendar of the current user's absences plus a
 * list with add/edit/delete. Opened from the user menu ("Absences").
 */
function AbsencesPage() {
  const { t } = useTranslation();
  const { data: absences, isLoading } = useGetMyAbsencesQuery(undefined);
  const [deleteAbsence] = useDeleteAbsenceMutation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Absence | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const typeLabel = (type: AbsenceType): string => {
    const key = type === 'sick' ? 'typeSick' : type === 'away' ? 'typeAway' : 'typeOther';
    return t(`absences.${key}`);
  };

  // Calendar events: all-day entries spanning [startDate, endDate] (the
  // calendar end is exclusive, so add one day).
  const calendarEvents: CalendarEvent[] = (absences ?? []).map(absence => ({
    title: `${typeLabel(absence.type)}${absence.description ? ` - ${absence.description}` : ''}`,
    start: new Date(`${absence.startDate}T00:00:00.000Z`),
    end: new Date(new Date(`${absence.endDate}T00:00:00.000Z`).getTime() + DAY_MS),
    allDay: true,
  }));

  const handleDelete = async (absence: Absence) => {
    setActionError(null);
    try {
      await deleteAbsence(absence.id).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  return (
    <Box p="md" maw={900} mx="auto">
      <Group justify="space-between" mb="lg">
        <Title order={2}>{t('absences.title')}</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          {t('absences.addAbsence')}
        </Button>
      </Group>

      {actionError && (
        <Card withBorder mb="md" p="sm">
          <Text c="red" size="sm">
            {actionError}
          </Text>
        </Card>
      )}

      <Card shadow="sm" withBorder mb="lg">
        <Calendar events={calendarEvents} defaultView="month" />
      </Card>

      <Card shadow="sm" withBorder>
        <Title order={4} mb="md">
          {t('absences.list')}
        </Title>
        {(absences ?? []).length === 0 ? (
          <Text c="dimmed" size="sm">
            {t('absences.noAbsences')}
          </Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('absences.type')}</Table.Th>
                <Table.Th>{t('absences.dates')}</Table.Th>
                <Table.Th>{t('absences.description')}</Table.Th>
                <Table.Th style={{ textAlign: 'right' }}>{t('common.actions')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(absences ?? []).map(absence => (
                <Table.Tr key={absence.id}>
                  <Table.Td>
                    <Badge color={TYPE_COLORS[absence.type]} variant="light">
                      {typeLabel(absence.type)}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">
                      {absence.startDate === absence.endDate
                        ? absence.startDate
                        : `${absence.startDate} - ${absence.endDate}`}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {absence.description || '-'}
                    </Text>
                  </Table.Td>
                  <Table.Td style={{ textAlign: 'right' }}>
                    <Group gap="xs" justify="flex-end" wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        aria-label={t('common.edit')}
                        onClick={() => {
                          setEditing(absence);
                          setDialogOpen(true);
                        }}
                      >
                        <IconPencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        aria-label={t('common.delete')}
                        onClick={() => handleDelete(absence)}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <AbsenceDialog opened={dialogOpen} absence={editing} onClose={() => setDialogOpen(false)} />
    </Box>
  );
}

export default AbsencesPage;
