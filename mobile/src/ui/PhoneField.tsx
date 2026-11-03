import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import PhoneInput from 'rn-international-phone-number';
import type { ICountry } from 'rn-international-phone-number';
import type { CountryCode } from 'libphonenumber-js';
import { coercePhoneToE164, nationalToE164 } from '../lib/phone';
import { colors } from '../theme';

type Props = {
  value: string;
  onChange: (e164: string) => void;
  disabled?: boolean;
};

export function PhoneField({ value, onChange, disabled }: Props) {
  // Seed once from the profile value — controlled re-seeds fight the picker.
  const initialE164 = useMemo(() => coercePhoneToE164(value), []);
  const [country, setCountry] = useState<ICountry | null>(null);
  const [national, setNational] = useState('');

  function emit(nextCountry: ICountry | null, nextNational: string) {
    const cca2 = (nextCountry?.cca2 as CountryCode | undefined) ?? 'IN';
    onChange(nationalToE164(nextNational, cca2));
  }

  return (
    <View style={styles.wrap}>
      <PhoneInput
        theme="dark"
        defaultCountry="IN"
        defaultPhoneNumber={initialE164 || undefined}
        disabled={disabled}
        modalDisabled={disabled}
        placeholder="Phone number"
        phoneInputPlaceholderTextColor={colors.textDim}
        phoneInputSelectionColor={colors.link}
        country={country}
        onChangeCountry={(next) => {
          setCountry(next);
          emit(next, national);
        }}
        onChangePhoneNumber={(next) => {
          setNational(next);
          emit(country, next);
        }}
        phoneInputStyles={{
          container: {
            backgroundColor: 'rgba(0,0,0,0.28)',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingVertical: 4,
          },
          flagContainer: {
            backgroundColor: 'transparent',
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            paddingHorizontal: 8,
          },
          divider: {
            backgroundColor: colors.border,
          },
          caret: {
            color: colors.textMuted,
            fontSize: 14,
          },
          callingCode: {
            color: colors.text,
            fontSize: 16,
          },
          input: {
            color: colors.text,
            fontSize: 16,
          },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
  },
});
