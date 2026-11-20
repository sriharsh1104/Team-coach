import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { AppIcon, AppIconName } from './AppIcon';
import { SoftPressable } from './SoftPressable';
import { emitToast } from './toastBus';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  icon: AppIconName;
  /** Accessible name + tooltip text. Never rendered on the button itself. */
  label: string;
  /** Short hover / long-press text when `label` is a longer sentence (e.g. includes a name). */
  tooltip?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Tints the icon with the theme's danger color (Remove / Delete / Discard). */
  danger?: boolean;
  /** Icon color override (defaults to the theme icon color). */
  color?: string;
  iconSize?: number;
  /** Borderless / no background — for toolbars that already provide their own chrome. */
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Icon-only action button. The wording is exposed through:
 * - `accessibilityLabel` (screen readers / tests),
 * - a hover tooltip on web (Pressable hover events),
 * - a toast on long-press on native, where hover doesn't exist.
 */
export function IconActionButton({
  icon,
  label,
  tooltip,
  onPress,
  disabled,
  loading,
  danger,
  color,
  iconSize = 20,
  plain,
  style,
}: Props) {
  const { colors } = useTheme();
  const tipLabel = tooltip ?? label;
  const [hovered, setHovered] = useState(false);
  const tint = color ?? (danger ? colors.danger : colors.icon);
  const isWeb = Platform.OS === 'web';

  return (
    <SoftPressable
      style={[
        staticStyles.btn,
        plain
          ? staticStyles.plain
          : { backgroundColor: colors.surface, borderColor: colors.border },
        disabled && staticStyles.disabled,
        style,
      ]}
      disabled={disabled || loading}
      onPress={onPress}
      onLongPress={isWeb ? undefined : () => emitToast(tipLabel, 1500)}
      onHoverIn={isWeb ? () => setHovered(true) : undefined}
      onHoverOut={isWeb ? () => setHovered(false) : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading }}
      hitSlop={6}
      pressScale={0.92}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <AppIcon name={icon} size={iconSize} color={tint} />
      )}
      {isWeb && hovered ? (
        <View pointerEvents="none" style={staticStyles.tipWrap}>
          <View
            style={[
              staticStyles.tip,
              { backgroundColor: colors.bg, borderColor: colors.border },
            ]}
          >
            <Text style={[staticStyles.tipText, { color: colors.text }]}>
              {tipLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </SoftPressable>
  );
}

const staticStyles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: { width: 38, height: 38, borderWidth: 0, backgroundColor: 'transparent' },
  disabled: { opacity: 0.4 },
  // Fixed-width, centered over the button so the label never wraps inside the
  // 40px button; the pill inside shrinks to the text.
  tipWrap: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    marginLeft: -80,
    width: 160,
    marginBottom: 6,
    alignItems: 'center',
    zIndex: 50,
  },
  tip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tipText: { fontSize: 12, fontWeight: '600' },
});
