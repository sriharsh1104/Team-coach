import React, { useState } from 'react';
import { TextInput } from 'react-native';

function nationalFromE164(value?: string) {
  if (!value) return '';
  const digits = String(value).replace(/\D/g, '');
  if (digits.length > 10 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

const PhoneInput = React.forwardRef(function MockPhoneInput(
  {
    defaultPhoneNumber,
    onChangePhoneNumber,
    placeholder,
  }: {
    defaultPhoneNumber?: string;
    onChangePhoneNumber?: (value: string) => void;
    placeholder?: string;
  },
  _ref: unknown,
) {
  const [text, setText] = useState(() => nationalFromE164(defaultPhoneNumber));
  return (
    <TextInput
      value={text}
      placeholder={placeholder ?? 'Phone number'}
      keyboardType="phone-pad"
      onChangeText={(next) => {
        setText(next);
        onChangePhoneNumber?.(next);
      }}
    />
  );
});

export type ICountry = { cca2?: string };
export default PhoneInput;
