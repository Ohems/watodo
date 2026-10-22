import Box from '@mui/material/Box';
import FormHelperText from '@mui/material/FormHelperText';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Select, { type SingleValue } from 'react-select';

interface SelectOption {
  value: string;
  label: string;
}

interface EditFieldProps {
  value: string;
  editing: boolean;
  options?: SelectOption[];
  /** Accessible name of the input; pages render the visible label themselves. */
  label?: string;
  /** Validation error: turns the input outline red and shows the message below it. */
  error?: string;
  onChange?: (value: string) => void;
}

function EditField({ value, editing, options, label, error, onChange }: EditFieldProps) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  if (!editing) {
    return (
      <p style={{ margin: '4px 0', minHeight: '24px' }}>
        {value || <em style={{ color: '#999' }}>{t('common.notSet')}</em>}
      </p>
    );
  }

  if (options) {
    const selected = options.find(o => o.value === localValue) ?? null;
    return (
      <Box>
        <Select<SelectOption>
          options={options}
          value={selected}
          onChange={(option: SingleValue<SelectOption>) => {
            const newValue = option?.value ?? '';
            setLocalValue(newValue);
            onChange?.(newValue);
          }}
          isClearable
          placeholder={label ?? t('common.select')}
        />
        {error && <FormHelperText error>{error}</FormHelperText>}
      </Box>
    );
  }

  return (
    <TextField
      fullWidth
      size="small"
      error={Boolean(error)}
      helperText={error}
      slotProps={{ htmlInput: { 'aria-label': label } }}
      value={localValue}
      onChange={e => {
        setLocalValue(e.target.value);
        onChange?.(e.target.value);
      }}
    />
  );
}

export default EditField;
