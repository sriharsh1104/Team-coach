import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ROLE_OPTIONS, ROLE_LABELS, RoleOption } from '../../api/roles';

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
          <Pressable
            key={role}
            disabled={!editable}
            onPress={() => onToggle?.(role)}
            style={[styles.pill, isActive && styles.pillActive]}
          >
            <Text style={isActive ? styles.pillTextActive : styles.pillText}>
              {ROLE_LABELS[role]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  pillActive: { backgroundColor: '#111', borderColor: '#111' },
  pillText: { color: '#111' },
  pillTextActive: { color: '#fff' },
});
