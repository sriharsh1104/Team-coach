import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import { MembershipRole } from '../api/types';
import { colors } from '../theme';
import { SoftPressable } from '../ui/SoftPressable';

const ROLE_OPTIONS: { value: MembershipRole; label: string }[] = [
  { value: 'PLAYER', label: 'Player' },
  { value: 'COACH', label: 'Coach' },
  { value: 'ANALYST', label: 'Analyst' },
];

interface Props {
  value: MembershipRole;
  onChange: (role: MembershipRole) => void;
}

export function RoleSelector({ value, onChange }: Props) {
  return (
    <View style={styles.row}>
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  pill: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pillActive: {
    backgroundColor: colors.chrome,
    borderColor: colors.chrome,
  },
  pillText: { color: colors.textMuted, fontWeight: '600' },
  pillTextActive: { color: colors.chromeInk, fontWeight: '700' },
});
