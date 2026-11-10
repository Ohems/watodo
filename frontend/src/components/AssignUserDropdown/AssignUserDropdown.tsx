import { Button, Group, Loader, Select, Stack, Text, Tooltip } from '@mantine/core';
import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getApiErrorMessage,
  useAssignUserToOccurrenceWorkRoleMutation,
  useGetAssignmentCandidatesQuery,
} from '../../api/index.js';
import type { EventWorkRole } from '../../types/index.js';
import { CandidateBadges, hasCandidateIssues } from '../CandidateBadges/index.js';

interface AssignUserDropdownProps {
  seriesId: number;
  /** The slot the user is assigned to; already-assigned users are hidden. */
  slot: EventWorkRole;
  /** Occurrence start/end ISO; used for the absence flags of the candidates. */
  start: string;
  end: string;
  /** Resolves the numeric occurrence ID (materializing a tmp ref on write). */
  resolveOccurrenceId: () => Promise<number>;
}

/**
 * The "Assign user" dropdown of one work role slot on the occurrence page.
 * Lists all users as candidates enriched with declared-role, qualification and
 * missing/expired-certification flags computed against the slot's work role.
 * Users who declared the role come first, absent users last; unqualified users
 * and missing certifications are shown as badges but can still be assigned
 * (coordinator override).
 */
export default function AssignUserDropdown({
  seriesId,
  slot,
  start,
  end,
  resolveOccurrenceId,
}: AssignUserDropdownProps) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const {
    data: candidates,
    isLoading,
    isError,
  } = useGetAssignmentCandidatesQuery({ seriesId, slotId: slot.id, start, end });
  const [assignUser] = useAssignUserToOccurrenceWorkRoleMutation();

  // Role declarers first, then qualified, absent users last; name order within
  // each group (the sort is stable).
  const sorted = [...(candidates ?? [])]
    .filter(user => !slot.assignments.some(a => a.userId === user.id))
    .sort(
      (a, b) =>
        Number(b.hasWorkRole) - Number(a.hasWorkRole) ||
        Number(a.hasAbsence) - Number(b.hasAbsence) ||
        Number(b.isQualified) - Number(a.isQualified) ||
        a.name.localeCompare(b.name),
    );

  const handleAssign = async () => {
    if (!selected) return;
    setError(null);
    setAssigning(true);
    try {
      const occurrenceId = await resolveOccurrenceId();
      await assignUser({ occurrenceId, workRoleId: slot.id, userId: selected }).unwrap();
      setSelected(null);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Group gap="xs" mt={4} wrap="nowrap">
      <Select
        size="sm"
        placeholder={t('events.assignUser')}
        data={sorted.map(user => ({ value: user.id, label: user.name }))}
        renderOption={({ option }) => {
          const user = sorted.find(u => u.id === option.value);
          if (!user) return <span>{option.label}</span>;
          const issues = hasCandidateIssues(user);
          // The dropdown is too narrow for inline badges: users with issues get
          // a warning icon left of the name, and the badges show in a tooltip
          // on hover.
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
        style={{ minWidth: 200 }}
      />
      <Button
        size="sm"
        variant="outline"
        leftSection={<IconPlus size={14} />}
        disabled={!selected}
        loading={assigning}
        onClick={handleAssign}
      >
        {t('events.assign')}
      </Button>
      {error && (
        <Text size="xs" c="red">
          {error}
        </Text>
      )}
    </Group>
  );
}
