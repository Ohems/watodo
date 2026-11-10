import { ActionIcon, Group, Loader, Table, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useGetAssignmentCandidatesQuery } from '../../api/index.js';
import type { EventWorkRole } from '../../types/index.js';
import { CandidateBadges } from '../CandidateBadges/index.js';

interface SlotAssigneesProps {
  seriesId: number;
  /** The slot whose assignees are listed. */
  slot: EventWorkRole;
  /** Occurrence start/end ISO; used for the absence flags of the candidates. */
  start: string;
  end: string;
  canWrite: boolean;
  onUnassign: (assignmentId: number) => void;
}

/**
 * The people list of one work role slot on the occurrence page: the assigned
 * users, each with the same fitness badges as in the assign dropdown (absent /
 * not qualified / missing or expired required certifications), computed against
 * the slot's work role via the assignment-candidates endpoint. The query is
 * shared (and deduplicated by RTK Query) with the slot's assign dropdown.
 */
export default function SlotAssignees({
  seriesId,
  slot,
  start,
  end,
  canWrite,
  onUnassign,
}: SlotAssigneesProps) {
  const { t } = useTranslation();
  const {
    data: candidates,
    isLoading,
    isError,
  } = useGetAssignmentCandidatesQuery({ seriesId, slotId: slot.id, start, end });
  const candidateByUserId = new Map((candidates ?? []).map(c => [c.id, c]));

  return (
    // Headerless table so the delete buttons align in a column.
    <Table mt={4} verticalSpacing="xs">
      <Table.Tbody>
        {isError ? (
          <Table.Tr>
            <Table.Td colSpan={2}>
              <Text size="sm" c="red">
                {t('common.dataUnavailable')}
              </Text>
            </Table.Td>
          </Table.Tr>
        ) : isLoading && !candidates ? (
          <Table.Tr>
            <Table.Td colSpan={2}>
              <Loader size="xs" aria-label={t('common.loading')} />
            </Table.Td>
          </Table.Tr>
        ) : (
          slot.assignments.map(assignment => {
            const candidate = candidateByUserId.get(assignment.userId);
            return (
              <Table.Tr key={assignment.id}>
                <Table.Td>
                  <Group gap="xs" wrap="nowrap">
                    <Text size="md" fw={500}>
                      {assignment.userName}
                    </Text>
                    {candidate && <CandidateBadges user={candidate} size="sm" />}
                  </Group>
                </Table.Td>
                <Table.Td style={{ width: 40, textAlign: 'right' }}>
                  {canWrite && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      aria-label={t('events.unassignUser', { name: assignment.userName })}
                      onClick={() => onUnassign(assignment.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  )}
                </Table.Td>
              </Table.Tr>
            );
          })
        )}
      </Table.Tbody>
    </Table>
  );
}
