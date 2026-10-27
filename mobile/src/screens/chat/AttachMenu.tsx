import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { EmojiBar } from './EmojiBar';
import { colors } from '../../theme';

export type AttachOption = 'photo' | 'video' | 'camera';

interface Props {
  onPickMedia: (option: AttachOption) => void;
  onPickEmoji: (emoji: string) => void;
}

/**
 * WhatsApp-style "+" attachment panel, anchored directly above the input
 * row (not a floating overlay elsewhere on screen) — one icon on the input
 * bar opens this instead of the previous separate emoji strip / 3-icon
 * toolbar row.
 */
export function AttachMenu({ onPickMedia, onPickEmoji }: Props) {
  const [showEmoji, setShowEmoji] = useState(false);

  if (showEmoji) {
    return (
      <View style={styles.panel}>
        <View style={styles.emojiHeader}>
          <Pressable onPress={() => setShowEmoji(false)} hitSlop={8} accessibilityLabel="Back to attach options">
            <Text style={styles.backArrow}>←</Text>
          </Pressable>
          <Text style={styles.emojiHeaderLabel}>Emoji</Text>
        </View>
        <EmojiBar onPick={onPickEmoji} />
      </View>
    );
  }

  const options: Array<{
    key: AttachOption | 'emoji';
    label: string;
    glyph: string;
    color: string;
    onPress: () => void;
  }> = [
    { key: 'emoji', label: 'Emoji', glyph: '😊', color: '#d9942b', onPress: () => setShowEmoji(true) },
    { key: 'photo', label: 'Photo', glyph: '🖼', color: '#8e44ad', onPress: () => onPickMedia('photo') },
    { key: 'video', label: 'Video', glyph: '🎥', color: '#c0392b', onPress: () => onPickMedia('video') },
    { key: 'camera', label: 'Camera', glyph: '📷', color: '#2980b9', onPress: () => onPickMedia('camera') },
  ];

  return (
    <View style={styles.panel}>
      <View style={styles.grid}>
        {options.map((opt) => (
          <Pressable
            key={opt.key}
            style={styles.gridItem}
            onPress={opt.onPress}
            accessibilityLabel={opt.label}
          >
            <View style={[styles.gridIcon, { backgroundColor: opt.color }]}>
              <Text style={styles.gridGlyph}>{opt.glyph}</Text>
            </View>
            <Text style={styles.gridLabel}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 14,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 20 },
  gridItem: { alignItems: 'center', width: 64 },
  gridIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  gridGlyph: { fontSize: 24 },
  gridLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  emojiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  backArrow: { color: colors.link, fontSize: 18, fontWeight: '700' },
  emojiHeaderLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
