import { useGetCurrentUserQuery } from '../api/index.js';

/**
 * The current user's configured week start as a Mantine `firstDayOfWeek`
 * value (0 = Sunday, 1 = Monday). Defaults to Sunday while the current user
 * is still loading.
 */
export function useFirstDayOfWeek(): 0 | 1 {
  const { data: currentUser } = useGetCurrentUserQuery();
  return currentUser?.weekStart === 'monday' ? 1 : 0;
}
