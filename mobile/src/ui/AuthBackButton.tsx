import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type Props = {
  onPress: () => void;
  label?: string;
};

/** Top-left back control for auth screens (verify email / signup / 2FA). */
export function AuthBackButton({ onPress, label = 'Back' }: Props) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.btn}
    >
      <Ionicons name="chevron-back" size={22} color={colors.text} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: -4,
    gap: 2,
  },
  label: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
