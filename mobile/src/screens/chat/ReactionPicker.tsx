import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

const QUICK_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
};

/** Six-emoji quick-react popup, opened from the selection toolbar. */
export function ReactionPicker({ visible, onClose, onPick }: Props) {
  const styles = useThemedStyles(pickerStyles);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={staticStyles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>React</Text>
          <View style={staticStyles.row}>
            {QUICK_EMOJI.map((emoji) => (
              <Pressable
                key={emoji}
                style={styles.emojiBtn}
                onPress={() => {
                  onPick(emoji);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`React with ${emoji}`}
              >
                <Text style={staticStyles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const staticStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  emoji: { fontSize: 30 },
});

function pickerStyles(c: ThemeColors) {
  return {
    sheet: {
      backgroundColor: c.bg,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: c.border,
    },
    title: { color: c.textMuted, fontSize: 12, fontWeight: '700' as const, textTransform: 'uppercase' as const, letterSpacing: 0.6 },
    emojiBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
    },
  };
}
