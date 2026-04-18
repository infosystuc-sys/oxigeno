import React from 'react';
import TextField from '@mui/material/TextField';
import { useMontoInput } from '../hooks/useMontoInput';

/**
 * Importe con miles, 2 decimales, alineado a la derecha (MUI).
 */
const MontoTextField = ({
  value,
  onValueChange,
  label,
  name,
  error,
  helperText,
  required,
  fullWidth = true,
  size = 'small',
  margin = 'none',
  disabled,
  InputProps,
  ...rest
}) => {
  const { value: shown, onFocus, onBlur, onChange } = useMontoInput(value, onValueChange);

  return (
    <TextField
      name={name}
      label={label}
      value={shown}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={onChange}
      variant="outlined"
      fullWidth={fullWidth}
      size={size}
      margin={margin}
      error={error}
      helperText={helperText}
      required={required}
      disabled={disabled}
      inputProps={{ inputMode: 'decimal' }}
      InputProps={{
        ...InputProps,
        sx: {
          '& input': { textAlign: 'right' },
          ...(InputProps?.sx && typeof InputProps.sx === 'object' && !Array.isArray(InputProps.sx)
            ? InputProps.sx
            : {}),
        },
      }}
      {...rest}
    />
  );
};

export default MontoTextField;
