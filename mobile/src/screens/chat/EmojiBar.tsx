import React from 'react';
import { ScrollView, Pressable, Text, StyleSheet } from 'react-native';

const EMOJIS = [
  '😀', '😂', '😍', '🔥', '👏', '💪', '🎯', '🏆',
  '😎', '🤝', '✅', '❌', '⚡', '🎮', '💬', '❤️',
  '👍', '👎', '🙌', '😅', '🥲', '🫡', '💀', '👀',
];

/** Lightweight free emoji strip — no paid sticker pack. */
export function EmojiBar({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {EMOJIS.map((emoji) => (
        <Pressable
          key={emoji}
          onPress={() => onPick(emoji)}
          style={styles.btn}
          hitSlop={4}
        >
          <Text style={styles.emoji}>{emoji}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 12, paddingBottom: 6, gap: 4 },
  btn: { paddingHorizontal: 4, paddingVertical: 2 },
  emoji: { fontSize: 22 },
});
