import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

/** Compact copy-to-clipboard control — icon only; flashes a check after copy. */
export function CopyButton({ value }: { value: string }) {
  const [justCopied, setJustCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onCopy = async () => {
    if (!value.trim()) return;
    await Clipboard.setStringAsync(value);
    setJustCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setJustCopied(false), 1200);
  };

  return (
    <Pressable
      style={[styles.btn, !value.trim() && styles.btnDisabled]}
      onPress={onCopy}
      disabled={!value.trim()}
      accessibilityRole="button"
      accessibilityLabel={justCopied ? 'Copied' : 'Copy'}
      hitSlop={8}
    >
      {justCopied ? (
        <Text style={styles.check}>✓</Text>
      ) : (
        <View style={styles.icon}>
          <View style={styles.iconBack} />
          <View style={styles.iconFront} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  btnDisabled: { opacity: 0.35 },
  check: { color: '#86efac', fontSize: 18, fontWeight: '700' },
  icon: { width: 16, height: 18 },
  iconBack: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 11,
    height: 13,
    borderWidth: 1.5,
    borderColor: '#f2f3f5',
    borderRadius: 2,
  },
  iconFront: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 11,
    height: 13,
    borderWidth: 1.5,
    borderColor: '#f2f3f5',
    borderRadius: 2,
    backgroundColor: '#1a1b1e',
  },
});
