import type { MantineSize } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import type { CSSProperties } from 'react';
import { DATE_FORMAT_HINTS, DATE_PICKER_PATTERNS } from '../../format.js';
import { useFirstDayOfWeek } from '../../hooks/use-first-day-of-week.js';
import { useFormatPreferences } from '../../hooks/use-formatters.js';

interface DateFieldProps {
  label?: string;
  /** Value in `yyyy-mm-dd` format; an empty string means no date selected. */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  /** Placeholder shown when empty; defaults to the user's date format as a hint. */
  placeholder?: string;
  description?: string;
  size?: MantineSize;
  style?: CSSProperties;
}

/**
 * Date input with a calendar popup. Unlike a native `type="date"` input
 * (whose popup week start is fixed by the browser), the calendar starts the
 * week on the current user's configured day, and the displayed format follows
 * the user's date format.
 */
function DateField({
  label,
  value,
  onChange,
  required,
  placeholder,
  description,
  size,
  style,
}: DateFieldProps) {
  const firstDayOfWeek = useFirstDayOfWeek();
  const { dateFormat } = useFormatPreferences();
  return (
    <DatePickerInput
      label={label}
      value={value === '' ? null : value}
      onChange={date => onChange(date ?? '')}
      valueFormat={DATE_PICKER_PATTERNS[dateFormat]}
      placeholder={placeholder ?? DATE_FORMAT_HINTS[dateFormat]}
      firstDayOfWeek={firstDayOfWeek}
      required={required}
      description={description}
      size={size}
      style={style}
      clearable
    />
  );
}

export default DateField;
