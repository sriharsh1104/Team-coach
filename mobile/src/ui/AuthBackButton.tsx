import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { AppIcon } from './AppIcon';
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
      <AppIcon name="chevron-back" size={22} color={colors.text} />
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
  },
});
