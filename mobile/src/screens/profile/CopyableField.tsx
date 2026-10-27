import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { CopyButton } from './CopyButton';

export function CopyableField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <CopyButton value={value} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  label: { color: '#9aa0a6', fontSize: 12 },
  value: { fontSize: 16, marginTop: 2, color: '#f2f3f5' },
});
