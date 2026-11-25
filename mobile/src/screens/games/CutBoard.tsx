import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { CUT_NUMBERS, CutPublicState, RoomView } from '../../api/games';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

type Props = {
  room: RoomView;
  meId: string;
  busy: boolean;
  onDraw: () => void;
};

/** One player's nine blocks — the ones they have cut are struck through. */
function PlayerBox({
  name,
  isYou,
  isTurn,
  cut,
  styles,
}: {
  name: string;
  isYou: boolean;
  isTurn: boolean;
  cut: number[];
  styles: ReturnType<typeof cutStyles>;
}) {
  const done = useMemo(() => new Set(cut), [cut]);
  return (
    <View style={[styles.playerBox, isTurn && styles.playerBoxActive]}>
      <View style={styles.playerHead}>
        <Text style={styles.playerName} numberOfLines={1}>
          {name}
          {isYou ? ' (You)' : ''}
        </Text>
        <Text style={[styles.playerCount, isTurn && styles.playerCountActive]}>
          {cut.length}/{CUT_NUMBERS.length}
        </Text>
      </View>
      <View style={styles.numberGrid}>
        {CUT_NUMBERS.map((n) => {
          const isCut = done.has(n);
          return (
            <View
              key={n}
              style={[styles.block, isCut && styles.blockCut]}
              accessibilityLabel={`${name} ${n}${isCut ? ', cut' : ''}`}
            >
              <Text style={[styles.blockText, isCut && styles.blockTextCut]}>
                {n}
              </Text>
              {isCut ? <View style={styles.strike} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Cut — everyone races to clear their own 1–9 board.
 *
 * The shared card sits on the right because it belongs to nobody: on your
 * turn you keep drawing it, cutting each new number, until it shows one you
 * have already cut and it passes on.
 */
export function CutBoard({ room, meId, busy, onDraw }: Props) {
  const styles = useThemedStyles(cutStyles);
  const cut = room.cut as CutPublicState;

  const myTurn = cut.phase === 'play' && cut.turnId === meId;
  const nameOf = (id: string) =>
    (room.players?.find((p) => p.userId === id)?.name?.trim() ||
      (id === meId ? 'You' : 'Player'));

  // A fresh number should land, not just appear — the pop is the whole
  // feedback loop of the game.
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (cut.lastDraw == null) return;
    pop.setValue(cut.lastWasRepeat ? 1 : 0.6);
    Animated.spring(pop, {
      toValue: 1,
      friction: 5,
      tension: 160,
      useNativeDriver: true,
    }).start();
  }, [cut.version, cut.lastDraw, cut.lastWasRepeat, pop]);

  const winner = cut.winnerId ? nameOf(cut.winnerId) : null;
  const banner =
    cut.phase === 'done'
      ? cut.winnerId === meId
        ? '🏆 You cleared your board — you win!'
        : `${winner} cleared their board first`
      : myTurn
        ? 'Your turn — draw the card'
        : `${nameOf(cut.turnId)}'s turn`;

  return (
    <View style={styles.root}>
      <View style={[styles.banner, myTurn && styles.bannerLive]}>
        {myTurn ? <View style={styles.bannerDot} /> : null}
        <Text style={styles.bannerText}>{banner}</Text>
      </View>

      <View style={styles.stage}>
        <View style={styles.boards}>
          {cut.playerIds.map((id) => (
            <PlayerBox
              key={id}
              name={nameOf(id)}
              isYou={id === meId}
              isTurn={cut.phase === 'play' && cut.turnId === id}
              cut={cut.cut[id] ?? []}
              styles={styles}
            />
          ))}
        </View>

        <View style={styles.cardPanel}>
          <Text style={styles.cardLabel}>Card</Text>
          <Animated.View
            accessibilityLabel={
              cut.lastDraw == null
                ? 'Card, nothing drawn yet'
                : `Card showing ${cut.lastDraw}`
            }
            style={[
              styles.card,
              cut.lastDraw != null && cut.lastWasRepeat && styles.cardRepeat,
              cut.lastDraw != null && !cut.lastWasRepeat && styles.cardHit,
              { transform: [{ scale: pop }] },
            ]}
          >
            <Text style={styles.cardNumber}>{cut.lastDraw ?? '–'}</Text>
          </Animated.View>
          <Text style={styles.cardNote} numberOfLines={2}>
            {cut.lastDraw == null
              ? 'Nothing drawn yet'
              : cut.lastWasRepeat
                ? 'Already cut — turn passed'
                : 'Cut! Draw again'}
          </Text>

          <Pressable
            style={[styles.drawBtn, (!myTurn || busy) && styles.drawBtnOff]}
            disabled={!myTurn || busy}
            onPress={onDraw}
            accessibilityRole="button"
            accessibilityLabel="Draw a number"
          >
            <Text
              style={[styles.drawText, (!myTurn || busy) && styles.drawTextOff]}
            >
              {cut.phase === 'done' ? 'Game over' : myTurn ? 'Draw' : 'Wait…'}
            </Text>
          </Pressable>
        </View>
      </View>

      {cut.lastEvent ? (
        <Text style={styles.event} numberOfLines={1}>
          {cut.lastDrawBy && cut.lastDrawBy !== meId
            ? `${nameOf(cut.lastDrawBy)}: ${cut.lastEvent}`
            : cut.lastEvent}
        </Text>
      ) : null}
    </View>
  );
}

function cutStyles(c: ThemeColors) {
  return {
    root: { padding: 16, gap: 12 },

    banner: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      alignSelf: 'center' as const,
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    bannerLive: {
      borderColor: 'rgba(34,197,94,0.55)',
      backgroundColor: 'rgba(34,197,94,0.12)',
    },
    bannerDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#22c55e',
    },
    bannerText: { color: c.text, fontSize: 13, fontWeight: '800' as const },

    stage: { flexDirection: 'row' as const, gap: 12, alignItems: 'flex-start' as const },
    boards: { flex: 1, gap: 10 },

    playerBox: {
      padding: 10,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      gap: 8,
    },
    // Whose turn it is has to be obvious without reading the banner.
    playerBoxActive: {
      borderColor: 'rgba(34,197,94,0.55)',
      backgroundColor: 'rgba(34,197,94,0.09)',
    },
    playerHead: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      gap: 8,
    },
    playerName: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800' as const,
      flexShrink: 1,
    },
    playerCount: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '800' as const,
      fontVariant: ['tabular-nums'] as never,
    },
    playerCountActive: { color: '#22c55e' },

    numberGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 6,
    },
    block: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
    },
    blockCut: {
      backgroundColor: 'rgba(34,197,94,0.16)',
      borderColor: 'rgba(34,197,94,0.45)',
    },
    blockText: {
      color: c.text,
      fontSize: 14,
      fontWeight: '800' as const,
      fontVariant: ['tabular-nums'] as never,
    },
    blockTextCut: { color: c.textDim },
    strike: {
      position: 'absolute' as const,
      width: '72%' as const,
      height: 2,
      borderRadius: 1,
      backgroundColor: '#22c55e',
      transform: [{ rotate: '-28deg' }],
    },

    cardPanel: { width: 112, alignItems: 'center' as const, gap: 8 },
    cardLabel: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '800' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    card: {
      width: 92,
      height: 120,
      borderRadius: 14,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.border,
      shadowColor: '#000',
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    cardHit: {
      borderColor: 'rgba(34,197,94,0.75)',
      backgroundColor: 'rgba(34,197,94,0.14)',
    },
    cardRepeat: {
      borderColor: 'rgba(239,68,68,0.7)',
      backgroundColor: 'rgba(239,68,68,0.12)',
    },
    cardNumber: {
      color: c.text,
      fontSize: 48,
      fontWeight: '900' as const,
      fontVariant: ['tabular-nums'] as never,
    },
    cardNote: {
      color: c.textMuted,
      fontSize: 10,
      textAlign: 'center' as const,
      lineHeight: 14,
    },
    drawBtn: {
      alignSelf: 'stretch' as const,
      paddingVertical: 11,
      borderRadius: 12,
      alignItems: 'center' as const,
      backgroundColor: c.chrome,
    },
    drawBtnOff: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
    drawText: { color: c.chromeInk, fontSize: 14, fontWeight: '900' as const },
    drawTextOff: { color: c.textMuted },

    event: {
      color: c.textDim,
      fontSize: 12,
      textAlign: 'center' as const,
    },
  };
}
