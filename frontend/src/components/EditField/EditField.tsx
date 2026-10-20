import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import Select, { type SingleValue } from 'react-select';

interface SelectOption {
  value: string;
  label: string;
}

interface EditFieldProps {
  value: string;
  editing: boolean;
  options?: SelectOption[];
  label?: string;
  onChange?: (value: string) => void;
}

function EditField({ value, editing, options, label, onChange }: EditFieldProps) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  if (!editing) {
    return (
      <p style={{ margin: '4px 0', minHeight: '24px' }}>
        {value || <em style={{ color: '#999' }}>Not set</em>}
      </p>
    );
  }

  if (options) {
    const selected = options.find(o => o.value === localValue) ?? null;
    return (
      <Select<SelectOption>
        options={options}
        value={selected}
        onChange={(option: SingleValue<SelectOption>) => {
          const newValue = option?.value ?? '';
          setLocalValue(newValue);
          onChange?.(newValue);
        }}
        isClearable
        placeholder={label ?? 'Select...'}
      />
    );
  }

  return (
    <TextField
      fullWidth
      size="small"
      label={label}
      value={localValue}
      onChange={e => {
        setLocalValue(e.target.value);
        onChange?.(e.target.value);
      }}
    />
  );
}

export default EditField;
