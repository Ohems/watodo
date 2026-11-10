import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Checkbox,
  Group,
  Loader,
  MultiSelect,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getApiErrorMessage,
  useCreateEventInfoSlotMutation,
  useCreateEventWorkRoleMutation,
  useDeleteEventInfoSlotMutation,
  useDeleteEventWorkRoleMutation,
  useGetAllRoomsQuery,
  useGetAllSitesQuery,
  useGetAllWorkRolesQuery,
  useGetCurrentUserQuery,
  useGetEventSeriesInfoSlotsQuery,
  useGetEventSeriesManagementQuery,
  useGetTeamsQuery,
  useListEventWorkRolesQuery,
  useUpdateEventInfoSlotMutation,
  useUpdateEventSeriesConfigMutation,
  useUpdateEventSeriesMutation,
  useUpdateEventWorkRoleMutation,
} from '../../api/index.js';
import { BookingConflictsAlert } from '../../components/BookingConflictsAlert/index.js';
import { QueryError } from '../../components/QueryState/index.js';
import { useAppSelector } from '../../hooks/redux.js';
import { useFormatters } from '../../hooks/use-formatters.js';
import { selectActiveOrganizationId } from '../../store/organization-slice.js';
import type { BookingConflict } from '../../types/index.js';

function EventConfigPage() {
  const { t } = useTranslation();
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const activeOrganizationId = useAppSelector(selectActiveOrganizationId);
  const { formatDateTime } = useFormatters();
  const { data: currentUser } = useGetCurrentUserQuery();
  const canWrite =
    currentUser?.permissions?.includes('admin') === true ||
    currentUser?.permissions?.includes('events:write') === true;

  const seriesId = Number.parseInt(eventId ?? '', 10);
  const validId = !Number.isNaN(seriesId);

  const {
    data: series,
    isLoading: loading,
    error: seriesError,
  } = useGetEventSeriesManagementQuery(validId ? seriesId : skipToken);
  const { data: sites = [], isError: sitesError } = useGetAllSitesQuery(
    activeOrganizationId ?? skipToken,
  );
  const { data: rooms = [], isError: roomsError } = useGetAllRoomsQuery(
    activeOrganizationId ?? skipToken,
  );
  const { data: teamsData, isError: teamsError } = useGetTeamsQuery(
    activeOrganizationId
      ? { organizationId: activeOrganizationId, query: { limit: 200 } }
      : skipToken,
  );
  const teams = teamsData?.items ?? [];
  const filtersError = sitesError || roomsError || teamsError;
  const [updateConfig, { isLoading: saving }] = useUpdateEventSeriesConfigMutation();
  const [updateSeries, { isLoading: savingDescription }] = useUpdateEventSeriesMutation();

  const [actionError, setActionError] = useState<string | null>(null);
  // Booking conflicts reported by the last save; the save itself succeeded.
  const [conflicts, setConflicts] = useState<BookingConflict[] | undefined>(undefined);
  const error = actionError ?? (seriesError ? getApiErrorMessage(seriesError) : null);

  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [reserveWholeSite, setReserveWholeSite] = useState(false);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  // The series description is only editable here (series management), never
  // on the occurrence page.
  const [descriptionDraft, setDescriptionDraft] = useState('');
  // Info slot template management (parent slots of the series).
  const [newInfoSlotTitle, setNewInfoSlotTitle] = useState('');
  const [newInfoSlotDescription, setNewInfoSlotDescription] = useState('');
  const [editingInfoSlotId, setEditingInfoSlotId] = useState<number | null>(null);
  const [editInfoSlotTitle, setEditInfoSlotTitle] = useState('');
  const [editInfoSlotDescription, setEditInfoSlotDescription] = useState('');
  const [editInfoSlotValue, setEditInfoSlotValue] = useState('');
  // Work role slot template management (parent slots of the series).
  const [newSlotWorkRoleId, setNewSlotWorkRoleId] = useState<number | null>(null);
  const [newSlotIsCritical, setNewSlotIsCritical] = useState(false);

  const {
    data: infoSlots = [],
    isLoading: infoSlotsLoading,
    isError: infoSlotsError,
  } = useGetEventSeriesInfoSlotsQuery(validId ? seriesId : skipToken);
  const {
    data: parentSlots = [],
    isLoading: slotsLoading,
    isError: slotsError,
  } = useListEventWorkRolesQuery(validId ? { seriesId, parentOnly: true } : skipToken);
  const { data: workRoles = [], isError: workRolesError } = useGetAllWorkRolesQuery(
    series?.organizationId ?? skipToken,
  );
  const [createInfoSlot, { isLoading: creatingInfoSlot }] = useCreateEventInfoSlotMutation();
  const [updateInfoSlot, { isLoading: updatingInfoSlot }] = useUpdateEventInfoSlotMutation();
  const [deleteInfoSlot] = useDeleteEventInfoSlotMutation();
  const [createSlot, { isLoading: creatingSlot }] = useCreateEventWorkRoleMutation();
  const [updateSlot] = useUpdateEventWorkRoleMutation();
  const [deleteSlot] = useDeleteEventWorkRoleMutation();

  const runTemplateAction = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  useEffect(() => {
    if (series) {
      setSelectedSiteId(series.siteId);
      setSelectedRoomId(series.roomId);
      setReserveWholeSite(series.reserveWholeSite);
      setSelectedTeamIds(series.teams.map(team => team.id));
      setDescriptionDraft(series.description ?? '');
    }
  }, [series]);

  // When the site changes, filter rooms to that site and clear the room if it
  // does not belong to the selected site.
  useEffect(() => {
    if (selectedRoomId && selectedSiteId) {
      const room = rooms.find(r => r.id === selectedRoomId);
      if (room && room.siteId !== selectedSiteId) {
        setSelectedRoomId(null);
      }
    }
  }, [selectedSiteId, rooms, selectedRoomId]);

  const availableRooms = selectedSiteId ? rooms.filter(r => r.siteId === selectedSiteId) : rooms;

  const handleSave = async () => {
    if (!series) return;
    setActionError(null);
    setConflicts(undefined);
    try {
      const result = await updateConfig({
        seriesId: series.id,
        data: {
          siteId: selectedSiteId,
          roomId: selectedRoomId,
          reserveWholeSite,
          teamIds: selectedTeamIds,
        },
      }).unwrap();
      setConflicts(result.conflicts);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  const handleSaveDescription = async () => {
    if (!series) return;
    setActionError(null);
    try {
      await updateSeries({
        seriesId: series.id,
        data: { description: descriptionDraft.trim() === '' ? null : descriptionDraft.trim() },
      }).unwrap();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    }
  };

  if (!validId) {
    return (
      <Box p="md">
        <Alert color="red">Invalid event ID</Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  }

  if (!series) {
    return (
      <Box p="md">
        <Alert color="red">{error ?? 'Event not found'}</Alert>
      </Box>
    );
  }

  return (
    <Box p="md" maw={700} mx="auto">
      <Group justify="space-between" mb="md">
        <Title order={3}>{series.title}</Title>
        {canWrite && (
          <Button variant="filled" onClick={handleSave} loading={saving}>
            {t('common.save')}
          </Button>
        )}
      </Group>

      {error && (
        <Alert color="red" variant="light" mb="md">
          {error}
        </Alert>
      )}

      <Box mb="md">
        <BookingConflictsAlert conflicts={conflicts} />
      </Box>

      {filtersError && (
        <Box mb="md">
          <QueryError />
        </Box>
      )}

      <Stack gap="md">
        <Card shadow="sm" withBorder>
          <Title order={5} mb="md">
            {t('events.generalInfo')}
          </Title>
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('events.organization')}
              </Text>
              <Text>{series.organizationName}</Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('events.seriesTitle')}
              </Text>
              <Text>{series.title}</Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('common.description')}
              </Text>
              {canWrite ? (
                <>
                  <Textarea
                    value={descriptionDraft}
                    onChange={event => setDescriptionDraft(event.currentTarget.value)}
                    minRows={2}
                  />
                  <Button
                    size="xs"
                    mt={4}
                    variant="light"
                    loading={savingDescription}
                    aria-label={t('events.saveDescription')}
                    onClick={handleSaveDescription}
                  >
                    {t('common.save')}
                  </Button>
                </>
              ) : (
                <Text style={{ whiteSpace: 'pre-wrap' }}>{series.description ?? '-'}</Text>
              )}
            </Box>
          </Stack>
        </Card>

        <Card shadow="sm" withBorder>
          <Group justify="space-between" mb={4} wrap="wrap">
            <Title order={5}>{t('events.workRoles')}</Title>
            {(slotsError || workRolesError) && <QueryError />}
          </Group>
          <Text size="xs" c="dimmed" mb="sm">
            {t('events.seriesWorkRolesHint')}
          </Text>
          <Stack gap="sm">
            {slotsLoading ? (
              <Loader size="xs" />
            ) : (
              parentSlots.map(slot => (
                <Group key={slot.id} gap="xs" wrap="wrap">
                  <Text size="sm" fw={500}>
                    {slot.workRoleName ?? slot.title}
                  </Text>
                  {slot.description && (
                    <Text size="xs" c="dimmed">
                      {slot.description}
                    </Text>
                  )}
                  {slot.isCritical && (
                    <Badge size="sm" color="red" variant="filled">
                      {t('events.critical')}
                    </Badge>
                  )}
                  {canWrite && (
                    <>
                      <Switch
                        size="xs"
                        label={t('events.criticalRole')}
                        checked={slot.isCritical}
                        onChange={() =>
                          runTemplateAction(() =>
                            updateSlot({
                              seriesId: series.id,
                              workRoleId: slot.id,
                              data: { isCritical: !slot.isCritical },
                            }).unwrap(),
                          )
                        }
                      />
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={t('events.deleteSlot')}
                        onClick={() =>
                          runTemplateAction(() =>
                            deleteSlot({ seriesId: series.id, workRoleId: slot.id }).unwrap(),
                          )
                        }
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </>
                  )}
                </Group>
              ))
            )}
            {parentSlots.length === 0 && !slotsLoading && (
              <Text size="sm" c="dimmed">
                {t('events.noRoleRequirements')}
              </Text>
            )}
            {canWrite && (
              <Group gap="xs" wrap="wrap">
                <Select
                  size="sm"
                  placeholder={t('events.selectWorkRole')}
                  data={workRoles.map(wr => ({ value: String(wr.id), label: wr.name }))}
                  value={newSlotWorkRoleId !== null ? String(newSlotWorkRoleId) : null}
                  onChange={value =>
                    setNewSlotWorkRoleId(value ? Number.parseInt(value, 10) : null)
                  }
                  clearable
                  style={{ minWidth: 180 }}
                />
                <Switch
                  size="sm"
                  label={t('events.criticalRole')}
                  checked={newSlotIsCritical}
                  onChange={event => setNewSlotIsCritical(event.currentTarget.checked)}
                />
                <Button
                  size="sm"
                  variant="light"
                  disabled={newSlotWorkRoleId === null}
                  loading={creatingSlot}
                  onClick={() =>
                    runTemplateAction(async () => {
                      if (newSlotWorkRoleId === null) return;
                      const wr = workRoles.find(w => w.id === newSlotWorkRoleId);
                      await createSlot({
                        seriesId: series.id,
                        data: {
                          title: wr?.name ?? 'Slot',
                          isCritical: newSlotIsCritical,
                          workRoleId: newSlotWorkRoleId,
                        },
                      }).unwrap();
                      setNewSlotWorkRoleId(null);
                      setNewSlotIsCritical(false);
                    })
                  }
                >
                  {t('events.addSlot')}
                </Button>
              </Group>
            )}
          </Stack>
        </Card>

        <Card shadow="sm" withBorder>
          <Group justify="space-between" mb={4} wrap="wrap">
            <Title order={5}>{t('events.infoSlots')}</Title>
            {infoSlotsError && <QueryError />}
          </Group>
          <Stack gap="sm">
            {infoSlotsLoading ? (
              <Loader size="xs" />
            ) : (
              infoSlots.map(infoSlot => (
                <Box key={infoSlot.id}>
                  {editingInfoSlotId === infoSlot.id ? (
                    <Stack gap="xs">
                      <TextInput
                        size="xs"
                        value={editInfoSlotTitle}
                        onChange={e => setEditInfoSlotTitle(e.currentTarget.value)}
                        placeholder={t('events.infoSlotTitlePlaceholder')}
                      />
                      <TextInput
                        size="xs"
                        value={editInfoSlotDescription}
                        onChange={e => setEditInfoSlotDescription(e.currentTarget.value)}
                        placeholder={t('events.infoSlotDescriptionPlaceholder')}
                      />
                      <Textarea
                        size="xs"
                        autosize
                        minRows={2}
                        value={editInfoSlotValue}
                        onChange={e => setEditInfoSlotValue(e.currentTarget.value)}
                        placeholder={t('events.infoSlotDefaultValue')}
                      />
                      <Group gap="xs">
                        <Button
                          size="xs"
                          disabled={editInfoSlotTitle.trim() === ''}
                          loading={updatingInfoSlot}
                          aria-label={t('events.saveInfoSlotValue')}
                          onClick={() =>
                            runTemplateAction(async () => {
                              await updateInfoSlot({
                                seriesId: series.id,
                                infoSlotId: infoSlot.id,
                                data: {
                                  title: editInfoSlotTitle.trim(),
                                  description: editInfoSlotDescription,
                                  value: editInfoSlotValue.trim() === '' ? null : editInfoSlotValue,
                                },
                              }).unwrap();
                              setEditingInfoSlotId(null);
                            })
                          }
                        >
                          {t('common.save')}
                        </Button>
                        <Button
                          size="xs"
                          variant="subtle"
                          onClick={() => setEditingInfoSlotId(null)}
                        >
                          {t('cancel')}
                        </Button>
                      </Group>
                    </Stack>
                  ) : (
                    <Group gap="xs" wrap="wrap">
                      <Text size="sm" fw={500}>
                        {infoSlot.title}
                      </Text>
                      {infoSlot.description && (
                        <Text size="xs" c="dimmed">
                          {infoSlot.description}
                        </Text>
                      )}
                      {canWrite && (
                        <>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            aria-label={t('events.editInfoSlot')}
                            onClick={() => {
                              setEditingInfoSlotId(infoSlot.id);
                              setEditInfoSlotTitle(infoSlot.title);
                              setEditInfoSlotDescription(infoSlot.description);
                              setEditInfoSlotValue(infoSlot.value ?? '');
                            }}
                          >
                            <IconPencil size={14} />
                          </ActionIcon>
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="red"
                            aria-label={t('events.deleteInfoSlot')}
                            onClick={() =>
                              runTemplateAction(() =>
                                deleteInfoSlot({
                                  seriesId: series.id,
                                  infoSlotId: infoSlot.id,
                                }).unwrap(),
                              )
                            }
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </>
                      )}
                    </Group>
                  )}
                </Box>
              ))
            )}
            {infoSlots.length === 0 && !infoSlotsLoading && (
              <Text size="sm" c="dimmed">
                {t('events.noInfoSlots')}
              </Text>
            )}
            {canWrite && (
              <Group gap="xs" wrap="wrap">
                <TextInput
                  size="sm"
                  value={newInfoSlotTitle}
                  onChange={e => setNewInfoSlotTitle(e.currentTarget.value)}
                  placeholder={t('events.infoSlotTitlePlaceholder')}
                  style={{ minWidth: 200 }}
                />
                <TextInput
                  size="sm"
                  value={newInfoSlotDescription}
                  onChange={e => setNewInfoSlotDescription(e.currentTarget.value)}
                  placeholder={t('events.infoSlotDescriptionPlaceholder')}
                  style={{ minWidth: 200 }}
                />
                <Button
                  size="sm"
                  variant="light"
                  disabled={newInfoSlotTitle.trim() === ''}
                  loading={creatingInfoSlot}
                  onClick={() =>
                    runTemplateAction(async () => {
                      await createInfoSlot({
                        seriesId: series.id,
                        data: {
                          title: newInfoSlotTitle.trim(),
                          description: newInfoSlotDescription,
                        },
                      }).unwrap();
                      setNewInfoSlotTitle('');
                      setNewInfoSlotDescription('');
                    })
                  }
                >
                  {t('events.addInfoSlot')}
                </Button>
              </Group>
            )}
          </Stack>
        </Card>

        <Card shadow="sm" withBorder>
          <Title order={5} mb="md">
            {t('events.schedule')}
          </Title>
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('events.start')}
              </Text>
              <Text>{formatDateTime(series.start)}</Text>
            </Box>

            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('events.durationMinutes')}
              </Text>
              <Text>{series.durationMinutes}</Text>
            </Box>
          </Stack>
        </Card>

        <Card shadow="sm" withBorder>
          <Title order={5} mb="md">
            {t('events.location')}
          </Title>
          <Stack gap="md">
            <Box>
              <Text size="sm" fw={500} c="dimmed" mb={4}>
                {t('events.site')}
              </Text>
              {canWrite ? (
                <Select
                  value={selectedSiteId}
                  onChange={value => {
                    setSelectedSiteId(value);
                    setSelectedRoomId(null);
                    setReserveWholeSite(false);
                  }}
                  data={sites.map(s => ({ value: s.id, label: s.name }))}
                  placeholder={t('events.noSite')}
                  clearable
                />
              ) : (
                <Text>{series.siteName ?? t('events.noSite')}</Text>
              )}
            </Box>

            {selectedSiteId && (
              <>
                <Box>
                  <Text size="sm" fw={500} c="dimmed" mb={4}>
                    {t('events.room')}
                  </Text>
                  {canWrite ? (
                    <Select
                      value={selectedRoomId}
                      onChange={setSelectedRoomId}
                      data={availableRooms.map(r => ({ value: r.id, label: r.name }))}
                      placeholder={t('events.roomUnclear')}
                      clearable
                    />
                  ) : (
                    <Text>{series.roomName ?? t('events.roomUnclear')}</Text>
                  )}
                </Box>

                {!selectedRoomId && canWrite && (
                  <Checkbox
                    label={t('events.reserveWholeSite')}
                    checked={reserveWholeSite}
                    onChange={e => setReserveWholeSite(e.currentTarget.checked)}
                  />
                )}
                {!canWrite && reserveWholeSite && !series.roomId && (
                  <Badge color="blue" variant="light">
                    {t('events.wholeSiteReserved')}
                  </Badge>
                )}
              </>
            )}
          </Stack>
        </Card>

        <Card shadow="sm" withBorder>
          <Title order={5} mb="md">
            {t('events.assignedTeams')}
          </Title>
          {canWrite ? (
            <MultiSelect
              value={selectedTeamIds}
              onChange={setSelectedTeamIds}
              data={teams.map(team => ({ value: team.id, label: team.name }))}
              placeholder={t('events.noTeams')}
              clearable
              searchable
            />
          ) : (
            <Group gap="xs">
              {series.teams.length > 0 ? (
                series.teams.map(team => (
                  <Badge key={team.id} size="lg" variant="light">
                    {team.name}
                  </Badge>
                ))
              ) : (
                <Text c="dimmed">{t('events.noTeams')}</Text>
              )}
            </Group>
          )}
        </Card>
      </Stack>

      <Box mt="lg">
        <Button variant="subtle" onClick={() => navigate('/events/management')}>
          {t('events.backToList')}
        </Button>
      </Box>
    </Box>
  );
}

export default EventConfigPage;
