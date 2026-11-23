import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  RoomView,
  UnoCard,
  UnoColor,
  UnoPublicState,
} from '../../api/games';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { GameCanvas } from '../../games/three/GameCanvas';
import { UNO_CAMERA, UnoScene3D } from '../../games/three/UnoScene3D';

const COLORS: UnoColor[] = ['red', 'yellow', 'green', 'blue'];

const FACE: Record<UnoColor | 'wild', string> = {
  red: '#dc2626',
  yellow: '#ca8a04',
  green: '#16a34a',
  blue: '#2563eb',
  wild: '#111827',
};

function rankLabel(rank: UnoCard['rank']): string {
  if (rank === 'draw2') return '+2';
  if (rank === 'wild4') return '+4';
  if (rank === 'skip') return 'Skip';
  if (rank === 'reverse') return 'Rev';
  if (rank === 'wild') return 'Wild';
  return rank;
}

type Props = {
  room: RoomView;
  meId: string;
  busy: boolean;
  mode?: '2d' | '3d';
  onFallback?: () => void;
  onPlay: (cardId: string) => void;
  onChooseColor: (color: UnoColor) => void;
  onDraw: () => void;
  onPass: () => void;
  onCall: () => void;
  onCatch: (targetId: string) => void;
};

function CardChip({
  card,
  playable,
  onPress,
  dim,
}: {
  card: UnoCard;
  playable?: boolean;
  onPress?: () => void;
  dim?: boolean;
}) {
  const bg = FACE[card.color === 'wild' ? 'wild' : card.color];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        chipStyles.card,
        { backgroundColor: bg, opacity: dim ? 0.45 : 1 },
        playable ? chipStyles.playable : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${card.color} ${rankLabel(card.rank)}`}
    >
      <Text style={chipStyles.rank}>{rankLabel(card.rank)}</Text>
    </Pressable>
  );
}

/**
 * Uno table: opponents + counts on top, 3D (or flat) discard in the middle,
 * your hand + actions at the bottom. Hands stay viewer-scoped from the server.
 */
export function UnoBoard({
  room,
  meId,
  busy,
  mode = '3d',
  onFallback,
  onPlay,
  onChooseColor,
  onDraw,
  onPass,
  onCall,
  onCatch,
}: Props) {
  const styles = useThemedStyles(unoStyles);
  const uno = room.uno as UnoPublicState;
  const playable = useMemo(
    () => new Set(uno.playableIds),
    [uno.playableIds],
  );
  const myTurn = uno.turnId === meId && uno.phase === 'play';
  const pickingColor = uno.phase === 'color' && uno.colorPickerId === meId;
  const myCount = uno.handCounts[meId] ?? uno.hand.length;

  const catchable = uno.playerIds.filter(
    (id) =>
      id !== meId &&
      (uno.handCounts[id] ?? 0) === 1 &&
      !uno.calledUno[id],
  );

  const turnName =
    room.players.find((p) => p.userId === uno.turnId)?.name ?? 'Someone';

  const banner =
    uno.phase === 'done'
      ? uno.winnerId === meId
        ? '🏆 You win!'
        : `${room.players.find((p) => p.userId === uno.winnerId)?.name ?? 'Someone'} wins`
      : pickingColor
        ? 'Pick a color for your wild'
        : uno.pendingDraw > 0 && myTurn
          ? `Draw stack: +${uno.pendingDraw} — take it or stack`
          : myTurn
            ? uno.canPass
              ? 'Play the drawn card or pass'
              : 'Your turn — match the discard'
            : `${turnName}'s turn`;

  const flatTable = (
    <View style={styles.flatTable}>
      <View style={[styles.colorDot, { backgroundColor: FACE[uno.color] }]} />
      {uno.top ? (
        <CardChip card={uno.top} />
      ) : (
        <View style={styles.emptyTop}>
          <Text style={styles.emptyTopText}>—</Text>
        </View>
      )}
      <View style={styles.deckChip}>
        <Text style={styles.deckText}>{uno.deckCount}</Text>
        <Text style={styles.deckSub}>deck</Text>
      </View>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.banner}>{banner}</Text>
      {uno.lastEvent ? <Text style={styles.event}>{uno.lastEvent}</Text> : null}

      <View style={styles.opponents}>
        {uno.playerIds
          .filter((id) => id !== meId)
          .map((id) => {
            const p = room.players.find((x) => x.userId === id);
            const count = uno.handCounts[id] ?? 0;
            const isTurn = uno.turnId === id;
            const called = !!uno.calledUno[id];
            return (
              <View
                key={id}
                style={[styles.opp, isTurn && styles.oppTurn]}
              >
                <Text style={styles.oppName} numberOfLines={1}>
                  {p?.name ?? 'Player'}
                  {called ? ' · UNO' : ''}
                </Text>
                <Text style={styles.oppCount}>{count}</Text>
                {catchable.includes(id) ? (
                  <Pressable
                    style={styles.catchBtn}
                    disabled={busy}
                    onPress={() => onCatch(id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Catch ${p?.name ?? 'player'}`}
                  >
                    <Text style={styles.catchText}>Catch</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
      </View>

      {mode === '3d' ? (
        <GameCanvas
          style={styles.canvas}
          camera={UNO_CAMERA}
          onFallback={onFallback}
          fallback={flatTable}
        >
          <UnoScene3D
            top={uno.top}
            color={uno.color}
            deckCount={uno.deckCount}
            direction={uno.direction}
          />
        </GameCanvas>
      ) : (
        flatTable
      )}

      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          Color · {uno.color}
          {uno.direction < 0 ? ' · ↺' : ' · ↻'}
        </Text>
        {uno.pendingDraw > 0 ? (
          <Text style={styles.stack}>+{uno.pendingDraw}</Text>
        ) : null}
      </View>

      {pickingColor ? (
        <View style={styles.colorRow}>
          {COLORS.map((c) => (
            <Pressable
              key={c}
              style={[styles.colorPick, { backgroundColor: FACE[c] }]}
              disabled={busy}
              onPress={() => onChooseColor(c)}
              accessibilityRole="button"
              accessibilityLabel={`Pick ${c}`}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        {myCount === 1 && !uno.calledUno[meId] ? (
          <Pressable
            style={styles.unoBtn}
            disabled={busy}
            onPress={onCall}
            accessibilityRole="button"
            accessibilityLabel="Call Uno"
          >
            <Text style={styles.unoBtnText}>UNO!</Text>
          </Pressable>
        ) : null}
        {uno.canDraw ? (
          <Pressable
            style={styles.actionBtn}
            disabled={busy}
            onPress={onDraw}
            accessibilityRole="button"
            accessibilityLabel={
              uno.pendingDraw > 0 ? `Draw ${uno.pendingDraw}` : 'Draw a card'
            }
          >
            <Text style={styles.actionText}>
              {uno.pendingDraw > 0 ? `Draw +${uno.pendingDraw}` : 'Draw'}
            </Text>
          </Pressable>
        ) : null}
        {uno.canPass ? (
          <Pressable
            style={styles.actionBtn}
            disabled={busy}
            onPress={onPass}
            accessibilityRole="button"
            accessibilityLabel="Pass"
          >
            <Text style={styles.actionText}>Pass</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.handLabel}>Your hand · {uno.hand.length}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.hand}
      >
        {uno.hand.map((card) => {
          const can = myTurn && playable.has(card.id) && !pickingColor;
          return (
            <CardChip
              key={card.id}
              card={card}
              playable={can}
              dim={!can && myTurn}
              onPress={
                can && !busy
                  ? () => onPlay(card.id)
                  : undefined
              }
            />
          );
        })}
      </ScrollView>
    </ScrollView>
  );
}

const chipStyles = StyleSheet.create({
  card: {
    width: 58,
    height: 84,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    marginRight: 8,
  },
  playable: {
    borderColor: '#fbbf24',
    transform: [{ translateY: -6 }],
  },
  rank: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 16,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

function unoStyles(c: ThemeColors) {
  return {
    wrap: { padding: 16, paddingBottom: 36, gap: 10 },
    banner: {
      color: c.text,
      fontSize: 16,
      fontWeight: '800' as const,
      textAlign: 'center' as const,
    },
    event: {
      color: c.textMuted,
      fontSize: 12,
      textAlign: 'center' as const,
      marginTop: -4,
    },
    opponents: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
      justifyContent: 'center' as const,
    },
    opp: {
      minWidth: 88,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center' as const,
    },
    oppTurn: { borderColor: c.chrome, borderWidth: 2 },
    oppName: { color: c.text, fontSize: 12, fontWeight: '700' as const, maxWidth: 100 },
    oppCount: { color: c.chrome, fontSize: 20, fontWeight: '900' as const, marginTop: 2 },
    catchBtn: {
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: c.danger,
    },
    catchText: { color: '#fff', fontSize: 11, fontWeight: '800' as const },
    canvas: { height: 220, marginTop: 4 },
    flatTable: {
      height: 140,
      borderRadius: 16,
      backgroundColor: '#14532d',
      borderWidth: 1,
      borderColor: c.border,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 16,
      marginTop: 4,
    },
    colorDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: '#fff',
    },
    emptyTop: {
      width: 58,
      height: 84,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    emptyTopText: { color: '#fff', fontSize: 18 },
    deckChip: {
      width: 54,
      height: 78,
      borderRadius: 10,
      backgroundColor: '#0f172a',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    deckText: { color: '#fff', fontWeight: '900' as const, fontSize: 16 },
    deckSub: { color: 'rgba(255,255,255,0.65)', fontSize: 10, marginTop: 2 },
    metaRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
    },
    meta: { color: c.textMuted, fontSize: 12, fontWeight: '600' as const },
    stack: {
      color: c.chromeInk,
      backgroundColor: c.chrome,
      overflow: 'hidden' as const,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 999,
      fontWeight: '800' as const,
      fontSize: 12,
    },
    colorRow: {
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 12,
      marginVertical: 4,
    },
    colorPick: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: '#fff',
    },
    actions: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      gap: 8,
      justifyContent: 'center' as const,
    },
    actionBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    actionText: { color: c.link, fontWeight: '800' as const },
    unoBtn: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: '#dc2626',
    },
    unoBtnText: { color: '#fff', fontWeight: '900' as const, letterSpacing: 1 },
    handLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 0.6,
      textTransform: 'uppercase' as const,
      marginTop: 6,
    },
    hand: { paddingVertical: 8, paddingRight: 12 },
  };
}
