import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  visible: boolean;
  onStay: () => void;
  onExit: () => void;
}

/**
 * Themed "Do you want to exit?" confirmation modal — replaces the default
 * Android Alert.alert dialog which doesn't follow the app's colour palette.
 */
export function ExitConfirmModal({ visible, onStay, onExit }: Props) {
  const { colors } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onStay}
      statusBarTranslucent
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.bg,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Title */}
          <Text style={[styles.title, { color: colors.text }]}>Exit App?</Text>

          {/* Message */}
          <Text style={[styles.message, { color: colors.textMuted }]}>
            Are you sure you want to exit Sacred Team Coach?
          </Text>

          {/* Buttons */}
          <View style={styles.btnRow}>
            {/* Stay */}
            <Pressable
              onPress={onStay}
              style={({ pressed }) => [
                styles.btn,
                styles.btnStay,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && styles.btnPressed,
              ]}
              accessibilityLabel="Stay in app"
            >
              <Text style={[styles.btnLabel, { color: colors.text }]}>Stay</Text>
            </Pressable>

            {/* Exit */}
            <Pressable
              onPress={onExit}
              style={({ pressed }) => [
                styles.btn,
                styles.btnExit,
                pressed && styles.btnPressed,
              ]}
              accessibilityLabel="Exit app"
            >
              <Text style={styles.btnExitLabel}>Exit</Text>
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
    // Shadow
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
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.72,
  },
  btnStay: {
    borderWidth: 1,
  },
  btnExit: {
    backgroundColor: '#e74c3c',
  },
  btnLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  btnExitLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
