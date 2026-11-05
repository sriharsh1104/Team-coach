import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors } from '../theme';

/** Scannable QR for an invite link — web's equivalent (`ui/InviteQr.tsx`)
 * also offers download/fullscreen, which don't carry over well to a phone:
 * you just hold the screen up to be scanned. */
export function InviteQr({
  value,
  label = 'Scan to join',
  size = 140,
}: {
  value: string;
  label?: string;
  size?: number;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.qrBox}>
        <QRCode value={value} size={size} backgroundColor="#ffffff" color="#0a0a0c" />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginBottom: 14 },
  qrBox: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
});
