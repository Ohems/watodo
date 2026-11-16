import { format } from 'date-fns';
import type { DateFormat, TimeFormat } from './types/index.js';

/** date-fns pattern per date format, used by formatDate/formatDateTime. */
export const DATE_FORMAT_PATTERNS: Record<DateFormat, string> = {
  ymd: 'yyyy-MM-dd',
  mdy: 'MM/dd/yyyy',
  dmy: 'dd/MM/yyyy',
};

/** date-fns pattern per time format. */
export const TIME_FORMAT_PATTERNS: Record<TimeFormat, string> = {
  '24h': 'HH:mm',
  '12h': 'hh:mm a',
};

/** Human-readable hint per date format, shown as the empty field's placeholder. */
export const DATE_FORMAT_HINTS: Record<DateFormat, string> = {
  ymd: 'YYYY-MM-DD',
  mdy: 'MM/DD/YYYY',
  dmy: 'DD/MM/YYYY',
};

/** Human-readable hint per time format, shown as the empty field's placeholder. */
export const TIME_FORMAT_HINTS: Record<TimeFormat, string> = {
  '24h': 'HH:mm',
  '12h': 'hh:mm AM/PM',
};

/** dayjs (Mantine pickers) pattern per date format, used as the pickers' valueFormat. */
export const DATE_PICKER_PATTERNS: Record<DateFormat, string> = {
  ymd: 'YYYY-MM-DD',
  mdy: 'MM/DD/YYYY',
  dmy: 'DD/MM/YYYY',
};

/** dayjs (Mantine pickers) pattern per time format. */
export const TIME_PICKER_PATTERNS: Record<TimeFormat, string> = {
  '24h': 'HH:mm',
  '12h': 'hh:mm A',
};

/** Formats a date or ISO datetime as a date in the given format, in local time. */
export function formatDate(value: string | Date, dateFormat: DateFormat): string {
  return format(value, DATE_FORMAT_PATTERNS[dateFormat]);
}

/** Formats a date or ISO datetime as date and time in the given formats, in local time. */
export function formatDateTime(
  value: string | Date,
  dateFormat: DateFormat,
  timeFormat: TimeFormat,
): string {
  return format(value, `${DATE_FORMAT_PATTERNS[dateFormat]} ${TIME_FORMAT_PATTERNS[timeFormat]}`);
}
