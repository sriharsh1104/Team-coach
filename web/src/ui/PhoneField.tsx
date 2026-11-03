import PhoneInput, { type Value } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { coercePhoneToE164 } from '../lib/phone';

type Props = {
  id?: string;
  value: string;
  onChange: (e164: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

export function PhoneField({
  id,
  value,
  onChange,
  placeholder = 'Phone number',
  required,
  disabled,
}: Props) {
  const e164 = coercePhoneToE164(value) || undefined;

  return (
    <PhoneInput
      id={id}
      className="phone-field"
      international
      defaultCountry="IN"
      countryCallingCodeEditable={false}
      placeholder={placeholder}
      value={e164 as Value | undefined}
      onChange={(next) => onChange(next ?? '')}
      required={required}
      disabled={disabled}
      numberInputProps={{
        autoComplete: 'tel-national',
        inputMode: 'tel',
      }}
    />
  );
}
