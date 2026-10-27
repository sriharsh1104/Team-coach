import React from 'react';
import { Text, Pressable, View, StyleSheet } from 'react-native';
import { MembershipRole } from '../api/types';

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
          <Pressable
            key={option.value}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={() => onChange(option.value)}
          >
            <Text style={isActive ? styles.pillTextActive : styles.pillText}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  pill: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  // Chrome accent to match Sacred auth chrome buttons
  pillActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  pillText: { color: '#e8eaed' },
  pillTextActive: { color: '#0a0a0c', fontWeight: '700' },
});
