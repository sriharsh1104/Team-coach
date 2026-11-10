import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ROLE_OPTIONS, ROLE_LABELS, RoleOption } from '../../api/roles';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';

export function RoleChips({
  selected,
  onToggle,
  editable = true,
}: {
  selected: string[];
  onToggle?: (role: RoleOption) => void;
  editable?: boolean;
}) {
  const styles = useThemedStyles(roleChipStyles);
  const roles = editable
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((role) => selected.includes(role));

  return (
    <View style={staticStyles.wrap}>
      {roles.map((role) => {
        const isActive = selected.includes(role);
        return (
          <SoftPressable
            key={role}
            disabled={!editable}
            onPress={() => onToggle?.(role)}
            style={[styles.pill, isActive && styles.pillActive]}
            pressScale={0.96}
          >
            <Text style={isActive ? styles.pillTextActive : styles.pillText}>
              {ROLE_LABELS[role]}
            </Text>
          </SoftPressable>
        );
      })}
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function roleChipStyles(c: ThemeColors) {
  return {
    // Was a hardcoded white wash (rgba(255,255,255,.14)/.04) that assumed a
    // dark backdrop — the unselected chip had no visible edge at all on the
    // white / lavender themes.
    pill: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginBottom: 4,
      backgroundColor: c.surface,
    },
    pillActive: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    pillText: { color: c.textMuted, fontWeight: '600' as const },
    pillTextActive: { color: c.chromeInk, fontWeight: '700' as const },
  };
}
