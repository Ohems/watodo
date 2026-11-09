import type { MantineSize } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import type { CSSProperties } from 'react';
import {
  DATE_FORMAT_HINTS,
  DATE_PICKER_PATTERNS,
  TIME_FORMAT_HINTS,
  TIME_PICKER_PATTERNS,
} from '../../format.js';
import { useFirstDayOfWeek } from '../../hooks/use-first-day-of-week.js';
import { useFormatPreferences } from '../../hooks/use-formatters.js';

interface DateTimeFieldProps {
  label?: string;
  /** Value in `yyyy-mm-ddThh:mm` format; an empty string means no value selected. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Placeholder shown when empty; defaults to the user's date/time format as a hint. */
  placeholder?: string;
  description?: string;
  size?: MantineSize;
  style?: CSSProperties;
}

/** Converts the app's `yyyy-mm-ddThh:mm` value to the picker's `yyyy-mm-dd hh:mm:ss`. */
function toPickerValue(value: string): string | null {
  if (value === '') return null;
  const normalized = value.replace('T', ' ');
  return normalized.length === 16 ? `${normalized}:00` : normalized;
}

/** Converts the picker's `yyyy-mm-dd hh:mm:ss` value back to the app's `yyyy-mm-ddThh:mm`. */
function fromPickerValue(value: string | null): string {
  if (!value) return '';
  return value.slice(0, 16).replace(' ', 'T');
}

/**
 * Date-and-time input with a calendar popup whose week starts on the current
 * user's configured day (native `type="datetime-local"` inputs cannot be
 * reconfigured). The displayed format follows the user's date/time formats.
 */
function DateTimeField({
  label,
  value,
  onChange,
  required,
  placeholder,
  description,
  size,
  style,
}: DateTimeFieldProps) {
  const firstDayOfWeek = useFirstDayOfWeek();
  const { dateFormat, timeFormat } = useFormatPreferences();
  const pattern = `${DATE_PICKER_PATTERNS[dateFormat]} ${TIME_PICKER_PATTERNS[timeFormat]}`;
  const hint = `${DATE_FORMAT_HINTS[dateFormat]} ${TIME_FORMAT_HINTS[timeFormat]}`;
  return (
    <DateTimePicker
      label={label}
      value={toPickerValue(value)}
      onChange={date => onChange(fromPickerValue(date))}
      valueFormat={pattern}
      placeholder={placeholder ?? hint}
      firstDayOfWeek={firstDayOfWeek}
      required={required}
      description={description}
      size={size}
      style={style}
      clearable
    />
  );
}

export default DateTimeField;
