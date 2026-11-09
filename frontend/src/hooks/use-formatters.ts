import { useMemo } from 'react';
import { useGetCurrentUserQuery } from '../api/index.js';
import { formatDate, formatDateTime } from '../format.js';
import type { DateFormat, TimeFormat } from '../types/index.js';

/** The current user's date/time format preferences, with defaults while loading. */
export function useFormatPreferences(): { dateFormat: DateFormat; timeFormat: TimeFormat } {
  const { data: currentUser } = useGetCurrentUserQuery();
  return {
    dateFormat: currentUser?.dateFormat ?? 'ymd',
    timeFormat: currentUser?.timeFormat ?? '24h',
  };
}

/** Date/time formatting functions bound to the current user's format preferences. */
export function useFormatters() {
  const { dateFormat, timeFormat } = useFormatPreferences();
  return useMemo(
    () => ({
      formatDate: (value: string | Date) => formatDate(value, dateFormat),
      formatDateTime: (value: string | Date) => formatDateTime(value, dateFormat, timeFormat),
    }),
    [dateFormat, timeFormat],
  );
}
