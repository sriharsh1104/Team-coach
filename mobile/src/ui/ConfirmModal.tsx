import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { setConfirmHandler, ConfirmRequest } from './confirmAsync';

/**
 * App-wide themed confirm dialog — replaces Android's unthemed Alert.alert
 * for Delete / Remove / Leave / Add flows. Wired once from AppShell.
 */
export function ConfirmModalHost() {
  const { colors } = useTheme();
  const [req, setReq] = useState<ConfirmRequest | null>(null);

  const close = useCallback((result: boolean) => {
    const resolve = req?.resolve;
    setReq(null);
    resolve?.(result);
  }, [req]);

  useEffect(() => {
    setConfirmHandler((next) => {
      setReq(next);
    });
    return () => setConfirmHandler(null);
  }, []);

  const visible = !!req;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => close(false)}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bg, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.title, { color: colors.text }]}>{req?.title}</Text>
          <Text style={[styles.message, { color: colors.textMuted }]}>{req?.message}</Text>
          <View style={styles.btnRow}>
            <Pressable
              onPress={() => close(false)}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && styles.btnPressed,
              ]}
              accessibilityLabel={req?.cancelLabel ?? 'Cancel'}
            >
              <Text style={[styles.btnLabel, { color: colors.text }]}>
                {req?.cancelLabel ?? 'Cancel'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => close(true)}
              style={({ pressed }) => [
                styles.btn,
                req?.destructive
                  ? styles.btnDanger
                  : { backgroundColor: colors.chrome },
                pressed && styles.btnPressed,
              ]}
              accessibilityLabel={req?.confirmLabel ?? 'Confirm'}
            >
              <Text
                style={[
                  styles.btnLabel,
                  { color: req?.destructive ? '#fff' : colors.chromeInk },
                ]}
              >
                {req?.confirmLabel ?? 'Confirm'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    lineHeight: 20,
  },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  btnPressed: { opacity: 0.72 },
  btnDanger: { backgroundColor: '#e74c3c', borderColor: '#e74c3c' },
  btnLabel: { fontSize: 15, fontWeight: '700' },
});
