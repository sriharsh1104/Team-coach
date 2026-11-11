import React from 'react';
import { StyleSheet } from 'react-native';
import { AppIcon } from './AppIcon';
import { colors } from '../theme';
import { SoftPressable } from './SoftPressable';

/**
 * Clearer stand-in for native-stack's default back chevron, which renders
 * small and low-contrast on some devices. Same icon-button look as the
 * menu/close/settings buttons elsewhere in the app.
 */
export function HeaderBackButton({ onPress }: { onPress: () => void }) {
  return (
    <SoftPressable
      onPress={onPress}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      pressScale={0.92}
    >
      <AppIcon name="chevron-back" size={22} color={colors.text} />
    </SoftPressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginLeft: -4,
  },
});
