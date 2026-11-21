import React from 'react';
import { Text } from 'react-native';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { splitMentionParts } from './chatMentions';
import { chatStyles } from './chatStyles';

/** Single / short emoji-only body → render as a sticker-sized glyph. */
export function isStickerEmoji(text: string | null | undefined) {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > 8) return false;
  // Reject if it contains letters/digits (plain text), allow emoji + ZWJ/variation.
  return !/[\p{L}\p{N}]/u.test(trimmed);
}

export function MessageText({
  text,
  knownIgns,
  mine,
}: {
  text: string;
  knownIgns: string[];
  mine: boolean;
}) {
  const styles = useThemedStyles(chatStyles);
  if (isStickerEmoji(text)) {
    return <Text style={styles.stickerEmoji}>{text.trim()}</Text>;
  }
  const parts = splitMentionParts(text, knownIgns);
  return (
    <Text style={mine ? styles.textMine : styles.text}>
      {parts.map((p, i) =>
        p.type === 'mention' ? (
          <Text key={i} style={mine ? styles.mentionMine : styles.mention}>
            {p.value}
          </Text>
        ) : (
          <Text key={i}>{p.value}</Text>
        ),
      )}
    </Text>
  );
}
