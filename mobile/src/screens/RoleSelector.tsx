import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MembershipRole } from '../api/types';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';

const ROLE_OPTIONS: { value: MembershipRole; label: string }[] = [
  { value: 'PLAYER', label: 'Player' },
  { value: 'COACH', label: 'Coach' },
  { value: 'ANALYST', label: 'Analyst' },
];

interface Props {
  // Null for an owner who hasn't chosen a roster seat yet — no pill shows active.
  value: MembershipRole | null;
  onChange: (role: MembershipRole) => void;
}

export function RoleSelector({ value, onChange }: Props) {
  const styles = useThemedStyles(roleSelectorStyles);
  return (
    <View style={staticStyles.row}>
      {ROLE_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <SoftPressable
            key={option.value}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(option.value)}
            pressScale={0.96}
          >
            <Text style={isActive ? styles.pillTextActive : styles.pillText}>
              {option.label}
            </Text>
          </SoftPressable>
        );
      })}
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function roleSelectorStyles(c: ThemeColors) {
  return {
    // Was a hardcoded white wash (rgba(255,255,255,.14)/.04) that assumed a
    // dark backdrop — the unselected pill had no visible edge at all on the
    // white / lavender themes.
    pill: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingVertical: 9,
      paddingHorizontal: 16,
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
