import { Badge } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { AssignmentCandidate } from '../../types/index.js';

interface CandidateBadgesProps {
  user: AssignmentCandidate;
  size?: 'xs' | 'sm';
}

/**
 * Whether the candidate has any fitness issues worth flagging: an overlapping
 * absence, a declared but unqualified work role, or a missing/expired required
 * certification.
 */
export function hasCandidateIssues(user: AssignmentCandidate): boolean {
  return (
    user.hasAbsence ||
    (user.hasWorkRole && !user.isQualified) ||
    user.missingCertifications.length > 0
  );
}

/**
 * The fitness badges of an assignment candidate: absent (overlapping absence),
 * not qualified (declared the slot's work role but not qualified) and one badge
 * per missing or expired required certification. Shown both in the assign
 * dropdown options and next to the assignees of a slot.
 */
export default function CandidateBadges({ user, size = 'xs' }: CandidateBadgesProps) {
  const { t } = useTranslation();
  return (
    <>
      {user.hasAbsence && (
        <Badge size={size} color="orange" variant="light">
          {t('events.absent')}
        </Badge>
      )}
      {user.hasWorkRole && !user.isQualified && (
        <Badge size={size} color="yellow" variant="light">
          {t('events.notQualified')}
        </Badge>
      )}
      {user.missingCertifications.map(cert => (
        <Badge key={cert.certificationId} size={size} color="red" variant="light">
          {cert.expiredDate
            ? t('events.missingCertificationExpired', {
                name: cert.name,
                date: cert.expiredDate,
              })
            : t('events.missingCertification', { name: cert.name })}
        </Badge>
      ))}
    </>
  );
}
