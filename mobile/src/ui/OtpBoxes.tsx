import React, { useRef } from 'react';
import {
  NativeSyntheticEvent,
  StyleSheet,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { colors } from '../theme';

export const OTP_LENGTH = 6;

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

function digitsOf(value: string): string[] {
  const cleaned = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
  return Array.from({ length: OTP_LENGTH }, (_, i) => cleaned[i] ?? '');
}

/** Six separate OTP cells — paste + backspace + auto-advance. */
export function OtpBoxes({ value, onChange, disabled }: Props) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = digitsOf(value);

  function commit(next: string[]) {
    onChange(next.join('').slice(0, OTP_LENGTH));
  }

  function focusAt(index: number) {
    refs.current[Math.max(0, Math.min(index, OTP_LENGTH - 1))]?.focus();
  }

  function applyRaw(raw: string, start: number) {
    const chars = raw.replace(/\D/g, '').slice(0, OTP_LENGTH - start).split('');
    if (chars.length === 0) return;
    const next = digits.slice();
    chars.forEach((ch, offset) => {
      next[start + offset] = ch;
    });
    commit(next);
    focusAt(Math.min(start + chars.length, OTP_LENGTH - 1));
  }

  function onKeyPress(
    index: number,
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
  ) {
    if (e.nativeEvent.key !== 'Backspace') return;
    if (digits[index]) {
      const next = digits.slice();
      next[index] = '';
      commit(next);
      return;
    }
    if (index > 0) {
      const next = digits.slice();
      next[index - 1] = '';
      commit(next);
      focusAt(index - 1);
    }
  }

  return (
    <View style={styles.row} accessibilityRole="none">
      {digits.map((digit, index) => (
        <TextInput
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          style={styles.box}
          value={digit}
          editable={!disabled}
          keyboardType="number-pad"
          textContentType={index === 0 ? 'oneTimeCode' : 'none'}
          autoComplete={index === 0 ? 'sms-otp' : 'off'}
          maxLength={index === 0 ? OTP_LENGTH : 1}
          selectTextOnFocus
          caretHidden={false}
          accessibilityLabel={`Digit ${index + 1} of ${OTP_LENGTH}`}
          onChangeText={(text) => {
            if (!text) {
              const next = digits.slice();
              next[index] = '';
              commit(next);
              return;
            }
            applyRaw(text, index);
          }}
          onKeyPress={(e) => onKeyPress(index, e)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 14,
  },
  box: {
    flex: 1,
    minWidth: 42,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
});
