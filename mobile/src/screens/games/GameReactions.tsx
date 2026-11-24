import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { GameReaction } from '../../api/games';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { haptic } from '../../ui/haptics';

export const REACTION_EMOJI: Record<GameReaction, string> = {
  angry: '😠',
  loser: '🤏',
  laughing: '😂',
  cool: '😎',
};

const REACTION_LABEL: Record<GameReaction, string> = {
  angry: 'Angry',
  loser: 'Loser',
  laughing: 'Laughing',
  cool: 'Cool',
};

export const REACTION_ORDER: GameReaction[] = [
  'angry',
  'loser',
  'laughing',
  'cool',
];

/** How long one emoji stays on screen, start to gone. */
const FLOAT_MS = 2200;

type Floater = {
  id: string;
  emoji: string;
  /** 0–1 across the width, so two at once rarely overlap. */
  lane: number;
  mine: boolean;
};

/**
 * The bar of taunts plus the emoji that float up over the board.
 *
 * Reactions are not game state — the server broadcasts them and stores
 * nothing — so this owns the whole lifetime: it is handed one on arrival,
 * animates it, and drops it. Nothing above it has to track a list.
 */
export function useGameReactions() {
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const seq = useRef(0);

  const show = useCallback((reaction: GameReaction, mine: boolean) => {
    const emoji = REACTION_EMOJI[reaction];
    if (!emoji) return;
    const id = `r${seq.current++}`;
    // Keep the lane away from the very edges so a wide emoji is never clipped.
    const lane = 0.15 + Math.random() * 0.7;
    setFloaters((prev) => [...prev.slice(-5), { id, emoji, lane, mine }]);
    setTimeout(
      () => setFloaters((prev) => prev.filter((f) => f.id !== id)),
      FLOAT_MS,
    );
  }, []);

  return { floaters, show };
}

export function ReactionOverlay({ floaters }: { floaters: Floater[] }) {
  return (
    // pointerEvents none: this sits over the board, and a drifting emoji must
    // never eat the tap that was meant for a square underneath it. It is also
    // hidden from assistive tech — a screen reader reading out drifting
    // decoration over a live game is pure noise.
    <View
      testID="reaction-overlay"
      style={overlayStyles.root}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {floaters.map((floater) => (
        <FloatingEmoji key={floater.id} floater={floater} />
      ))}
    </View>
  );
}

function FloatingEmoji({ floater }: { floater: Floater }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: FLOAT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -170],
  });
  // A small sideways drift stops two of the same emoji looking like one.
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, floater.mine ? 14 : -14, 0],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.15, 0.75, 1],
    outputRange: [0, 1, 1, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0.6, 1.15, 0.95],
  });

  return (
    <Animated.Text
      testID="reaction-floater"
      style={[
        overlayStyles.emoji,
        {
          left: `${floater.lane * 100}%`,
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    >
      {floater.emoji}
    </Animated.Text>
  );
}

export function ReactionBar({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (reaction: GameReaction) => void;
}) {
  const styles = useThemedStyles(barStyles);
  return (
    <View style={styles.row}>
      {REACTION_ORDER.map((reaction) => (
        <SoftPressable
          key={reaction}
          style={[styles.chip, disabled && styles.chipDisabled]}
          disabled={disabled}
          onPress={() => {
            haptic('light');
            onSend(reaction);
          }}
          pressScale={0.88}
          accessibilityRole="button"
          accessibilityLabel={`Send ${REACTION_LABEL[reaction]} reaction`}
        >
          <Text style={styles.chipEmoji}>{REACTION_EMOJI[reaction]}</Text>
        </SoftPressable>
      ))}
    </View>
  );
}

const overlayStyles = {
  root: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: 200,
    overflow: 'visible' as const,
  },
  emoji: {
    position: 'absolute' as const,
    bottom: 0,
    fontSize: 38,
  },
};

function barStyles(c: ThemeColors) {
  return {
    row: {
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 10,
      paddingVertical: 6,
    },
    chip: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipDisabled: { opacity: 0.45 },
    chipEmoji: { fontSize: 22 },
  };
}
