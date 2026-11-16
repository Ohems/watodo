import { Badge, Button, Group, Loader, Modal, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconPlus, IconRepeat } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useAssignUserToOccurrenceWorkRoleMutation,
  useGetAssignmentCandidatesQuery,
} from '../../api/index.js';
import type { EventWorkRole } from '../../types/index.js';
import { CandidateBadges, hasCandidateIssues } from '../CandidateBadges/index.js';

interface AssignUserModalProps {
  seriesId: number;
  /** The slot the user is assigned to; already-assigned users are hidden. */
  slot: EventWorkRole;
  /** Occurrence start/end ISO; used for the absence flags of the candidates. */
  start: string;
  end: string;
  /** Resolves the numeric occurrence ID (materializing a tmp ref on write). */
  resolveOccurrenceId: () => Promise<number>;
  /** Optional bulk assign: assign the selected user to the same slot across all occurrences in range. */
  onAssignBulk?: (userId: string) => Promise<void>;
  bulkLoading?: boolean;
}

/**
 * The "Assign" button of one work role slot, placed in the slot header. Opens
 * a modal with the candidate selection; confirming assigns the user to the
 * slot. Lists all users as candidates enriched with declared-role,
 * qualification and missing/expired-certification flags computed against the
 * slot's work role, sorted role-declarers first, then least-loaded in range,
 * absent last. Users with any issue are flagged with a warning icon (badges
 * in a hover tooltip, since the dropdown is too narrow for inline badges), but
 * can still be assigned (coordinator override).
 */
export default function AssignUserModal({
  seriesId,
  slot,
  start,
  end,
  resolveOccurrenceId,
  onAssignBulk,
  bulkLoading,
}: AssignUserModalProps) {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const {
    data: candidates,
    isLoading,
    isError,
  } = useGetAssignmentCandidatesQuery({ seriesId, slotId: slot.id, start, end });
  const [assignUser] = useAssignUserToOccurrenceWorkRoleMutation();

  const sorted = [...(candidates ?? [])]
    .filter(user => !slot.assignments.some(a => a.userId === user.id))
    .sort(
      (a, b) =>
        Number(b.hasWorkRole) - Number(a.hasWorkRole) ||
        (a.assignmentCount ?? 0) - (b.assignmentCount ?? 0) ||
        Number(a.hasAbsence) - Number(b.hasAbsence) ||
        Number(b.isQualified) - Number(a.isQualified) ||
        a.name.localeCompare(b.name),
    );

  const close = () => {
    setOpened(false);
    setSelected(null);
    setError(null);
  };

  const handleAssign = async () => {
    if (!selected) return;
    setError(null);
    setAssigning(true);
    try {
      const occurrenceId = await resolveOccurrenceId();
      await assignUser({ occurrenceId, workRoleId: slot.id, userId: selected }).unwrap();
      close();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  const handleAssignBulk = async () => {
    if (!selected || !onAssignBulk) return;
    setError(null);
    setBulkAssigning(true);
    try {
      await onAssignBulk(selected);
      close();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setBulkAssigning(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        leftSection={<IconPlus size={14} />}
        onClick={() => setOpened(true)}
      >
        {t('events.assign')}
      </Button>
      <Modal
        opened={opened}
        onClose={close}
        centered
        title={t('events.assignUserToSlot', { slot: slot.workRoleName ?? slot.title })}
      >
        <Stack gap="sm">
          <Select
            size="sm"
            label={t('events.assignUser')}
            placeholder={t('events.selectUser')}
            data={sorted.map(user => ({ value: user.id, label: user.name }))}
            renderOption={({ option }) => {
              const user = sorted.find(u => u.id === option.value);
              if (!user) return <span>{option.label}</span>;
              const issues = hasCandidateIssues(user);
              const row = (
                <Group gap={4} wrap="nowrap">
                  {issues && (
                    <IconAlertTriangle
                      size={14}
                      color="var(--mantine-color-yellow-7)"
                      aria-label={t('events.candidateHasIssues')}
                    />
                  )}
                  <span>{option.label}</span>
                  {user.assignmentCount > 0 && (
                    <Tooltip
                      label={t('staffing.assignmentsInRange', { count: user.assignmentCount })}
                      withArrow
                    >
                      <Badge size="xs" variant="light" color="gray">
                        {user.assignmentCount}
                      </Badge>
                    </Tooltip>
                  )}
                </Group>
              );
              if (!issues) return row;
              return (
                <Tooltip
                  position="right"
                  withArrow
                  label={
                    <Stack gap={4} align="flex-start">
                      <CandidateBadges user={user} size="sm" />
                    </Stack>
                  }
                >
                  <span style={{ display: 'inline-flex', width: '100%' }}>{row}</span>
                </Tooltip>
              );
            }}
            value={selected}
            onChange={value => setSelected(value)}
            disabled={isError}
            rightSection={isLoading ? <Loader size={14} /> : undefined}
            nothingFoundMessage={
              isError ? t('common.dataUnavailable') : isLoading ? undefined : t('common.noResults')
            }
            searchable
          />
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" onClick={close}>
              {t('common.cancel')}
            </Button>
            {onAssignBulk && (
              <Button
                variant="light"
                leftSection={<IconRepeat size={14} />}
                disabled={!selected}
                loading={bulkAssigning || bulkLoading}
                aria-label={t('staffing.assignToAllInRange')}
                onClick={handleAssignBulk}
              >
                {t('staffing.assignToAllInRangeShort')}
              </Button>
            )}
            <Button disabled={!selected} loading={assigning} onClick={handleAssign}>
              {t('events.assign')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
