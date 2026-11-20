import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChatReaction } from '../../api/types';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

type Props = {
  reactions: ChatReaction[];
  /** Tapping a pill quick-toggles the viewer's own reaction with that emoji. */
  onToggle: (emoji: string) => void;
};

/** Compact "👍 3" pills row under a bubble — tap to add/remove your own. */
export function MessageReactionPills({ reactions, onToggle }: Props) {
  const styles = useThemedStyles(pillStyles);
  if (reactions.length === 0) return null;

  return (
    <View style={staticStyles.row}>
      {reactions.map((r) => (
        <Pressable
          key={r.emoji}
          onPress={() => onToggle(r.emoji)}
          style={[styles.pill, r.reactedByMe && styles.pillMine]}
          accessibilityRole="button"
          accessibilityLabel={`${r.emoji} reaction, ${r.count}${r.reactedByMe ? ', you reacted' : ''}`}
          hitSlop={4}
        >
          <Text style={styles.emoji}>{r.emoji}</Text>
          <Text style={[styles.count, r.reactedByMe && styles.countMine]}>{r.count}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const staticStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
});

function pillStyles(c: ThemeColors) {
  return {
    pill: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    pillMine: {
      backgroundColor: c.chrome + '22',
      borderColor: c.chrome,
    },
    emoji: { fontSize: 13 },
    count: { fontSize: 11, fontWeight: '700' as const, color: c.textMuted },
    countMine: { color: c.chrome },
  };
}
