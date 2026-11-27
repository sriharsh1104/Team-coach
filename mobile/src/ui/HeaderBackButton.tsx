import React from 'react';
import { StyleSheet } from 'react-native';
import { AppIcon } from './AppIcon';
import { useTheme } from '../theme/ThemeContext';
import { SoftPressable } from './SoftPressable';

/**
 * Clearer stand-in for native-stack's default back chevron, which renders
 * small and low-contrast on some devices. Same icon-button look as the
 * menu/settings buttons elsewhere in the app.
 */
export function HeaderBackButton({
  onPress,
  accessibilityLabel = 'Go back',
}: {
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <SoftPressable
      onPress={onPress}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
      pressScale={0.92}
    >
      <AppIcon name="chevron-back" size={26} color={colors.icon} />
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
  },
});
