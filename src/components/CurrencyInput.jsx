import React from 'react';
import { NumericFormat } from 'react-number-format';

export default function CurrencyInput({
  value,
  onChange,
  onValueChange,
  name,
  className = '',
  ...props
}) {
  return (
    <NumericFormat
      name={name}
      className={`currency-input ${className}`}
      prefix="₱ "
      thousandSeparator=","
      decimalScale={2}
      allowNegative={false}
      valueIsNumericString={true}
      value={value !== null && value !== undefined ? String(value) : ''}
      onValueChange={(values, sourceInfo) => {
        // values = { formattedValue: '₱ 1,500', value: '1500', floatValue: 1500 }
        // We pass the string representation of the unformatted number (e.g. '1500') 
        // to maintain exactly the same signature we used before.
        const val = values.value;

        if (onValueChange) {
          onValueChange(val, name);
        }
        if (onChange) {
          onChange({
            target: {
              name: name,
              value: val || '',
            },
          });
        }
      }}
      {...props}
    />
  );
}
