import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ROLE_OPTIONS, ROLE_LABELS, RoleOption } from '../../api/roles';
import { colors } from '../../theme';
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
  return (
    <View style={styles.wrap}>
      {ROLE_OPTIONS.map((role) => {
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

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillActive: {
    backgroundColor: colors.chrome,
    borderColor: colors.chrome,
  },
  pillText: { color: colors.textMuted, fontWeight: '600' },
  pillTextActive: { color: colors.chromeInk, fontWeight: '700' },
});
