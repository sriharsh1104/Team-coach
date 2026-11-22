import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { ThemeColors } from '../../theme';
import { AppIcon } from '../../ui/AppIcon';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** System share sheet (WhatsApp, etc.). */
  onShareOutside: () => void;
  /** Forward into another in-app chat. */
  onForwardToChat: () => void;
};

/** Compact clip under the selection-bar share icon. */
export function ShareClipSheet({
  visible,
  onClose,
  onShareOutside,
  onForwardToChat,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(sheetStyles);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={staticStyles.backdrop}
        onPress={onClose}
        accessibilityLabel="Dismiss share options"
      >
        <Pressable
          style={styles.sheet}
          onPress={() => undefined}
          accessibilityRole="menu"
        >
          <Text style={styles.title}>Share</Text>
          <Pressable
            style={styles.row}
            onPress={onShareOutside}
            accessibilityRole="menuitem"
            accessibilityLabel="Share to WhatsApp and more"
          >
            <AppIcon name="share-social-outline" size={20} color={colors.link} />
            <View style={staticStyles.rowText}>
              <Text style={styles.rowLabel}>WhatsApp & more</Text>
              <Text style={styles.rowHint}>Open phone share sheet</Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.row}
            onPress={onForwardToChat}
            accessibilityRole="menuitem"
            accessibilityLabel="Forward to another chat"
          >
            <AppIcon name="chatbubble-outline" size={20} color={colors.link} />
            <View style={staticStyles.rowText}>
              <Text style={styles.rowLabel}>Forward to chat</Text>
              <Text style={styles.rowHint}>Send inside Team Coach</Text>
            </View>
          </Pressable>
          <Pressable
            style={styles.cancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
          >
            <Text style={styles.cancelLabel}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const sheetStyles = (c: ThemeColors) => ({
  sheet: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    backgroundColor: c.bg,
    overflow: 'hidden' as const,
    alignSelf: 'stretch' as const,
  },
  title: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase' as const,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: { color: c.text, fontSize: 15, fontWeight: '600' as const },
  rowHint: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  cancel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    paddingVertical: 14,
    alignItems: 'center' as const,
  },
  cancelLabel: { color: c.link, fontSize: 15, fontWeight: '700' as const },
});

const staticStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  rowText: { flex: 1, minWidth: 0 },
});
