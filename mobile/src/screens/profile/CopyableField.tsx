import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export function CopyableField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [justCopied, setJustCopied] = useState(false);

  const onCopy = async () => {
    await Clipboard.setStringAsync(value);
    setJustCopied(true);
    setTimeout(() => setJustCopied(false), 1500);
  };

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.value}>{value}</Text>
      </View>
      <Pressable onPress={onCopy} style={styles.copyButton} hitSlop={10}>
        <Text style={styles.copyText}>{justCopied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: { color: '#888', fontSize: 12 },
  value: { fontSize: 16, marginTop: 2 },
  copyButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f1f1f1',
  },
  copyText: { fontSize: 13, fontWeight: '600', color: '#111' },
});
