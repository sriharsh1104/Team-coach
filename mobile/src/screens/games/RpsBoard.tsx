import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { RoomView, RpsChoice } from '../../api/games';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { GameCanvas } from '../../games/three/GameCanvas';
import { RPS_CAMERA, RpsScene3D } from '../../games/three/RpsScene3D';

const HAND: Record<RpsChoice, string> = { stone: '✊', paper: '✋', scissors: '✌️' };
const LABEL: Record<RpsChoice, string> = { stone: 'Stone', paper: 'Paper', scissors: 'Scissors' };
const CHOICES: RpsChoice[] = ['stone', 'paper', 'scissors'];

type Props = {
  room: RoomView;
  meId: string;
  onPick: (choice: RpsChoice) => void;
  busy: boolean;
  /** 3D hands (expo-gl) or the flat emoji arena. */
  mode?: '2d' | '3d';
  /** 3D scene could not start — parent should flip to 2D. */
  onFallback?: () => void;
};

/**
 * Two fists face each other; while a round is being decided they pump three
 * times (the classic "stone… paper… scissors… shoot!") and then open into
 * each player's pick. Scores + round counter on top, pick buttons below.
 */
export function RpsBoard({ room, meId, onPick, busy, mode = '2d', onFallback }: Props) {
  const styles = useThemedStyles(rpsStyles);
  const rps = room.rps!;
  const opponentId = rps.playerIds.find((id) => id !== meId) ?? rps.playerIds[1];
  const me = room.players.find((p) => p.userId === meId);
  const opp = room.players.find((p) => p.userId === opponentId);
  const myScore = rps.scores[meId] ?? 0;
  const oppScore = rps.scores[opponentId] ?? 0;

  const reveal = rps.phase !== 'picking' && rps.lastResult;
  const myPick = reveal ? rps.lastResult!.picks[meId] : null;
  const oppPick = reveal ? rps.lastResult!.picks[opponentId] : null;
  const iPicked = rps.picked[meId];
  const oppPicked = rps.picked[opponentId];

  // Shake animation: runs whenever a reveal starts (both picked) and while
  // waiting on the opponent, so the hands never sit dead still mid-round.
  const shake = useRef(new Animated.Value(0)).current;
  const [shaking, setShaking] = useState(false);
  const revealKey = rps.lastResult ? `${rps.lastResult.round}:${rps.history.length}` : 'none';
  const lastRevealKey = useRef(revealKey);

  useEffect(() => {
    if (rps.phase === 'picking') {
      lastRevealKey.current = revealKey;
      return;
    }
    if (revealKey === lastRevealKey.current && !shaking) return;
    lastRevealKey.current = revealKey;
    setShaking(true);
    // In 3D the scene pumps the hands itself and reports back via onShakeDone.
    if (mode === '3d') return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => setShaking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, rps.phase, mode]);

  const bob = shake.interpolate({ inputRange: [0, 1], outputRange: [0, -26] });
  const showHands = reveal && !shaking;

  const roundWinner = rps.lastResult?.winnerId;
  const banner =
    rps.phase === 'done'
      ? rps.winnerId === meId
        ? '🏆 You won the match!'
        : `${opp?.name ?? 'Opponent'} won the match`
      : reveal && !shaking
        ? roundWinner == null
          ? 'Draw — play again'
          : roundWinner === meId
            ? 'You win this round!'
            : `${opp?.name ?? 'Opponent'} wins this round`
        : iPicked && !oppPicked
          ? `Waiting for ${opp?.name ?? 'opponent'}…`
          : 'Make your pick';

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreRow}>
        <PlayerScore name={me?.name ?? 'You'} score={myScore} you styles={styles} />
        <View style={styles.roundBlock}>
          <Text style={styles.roundLabel}>ROUND</Text>
          <Text style={styles.roundNum}>
            {Math.min(rps.round, rps.maxRounds)}/{rps.maxRounds}
          </Text>
          <Text style={styles.roundHint}>first to {rps.winsNeeded}</Text>
        </View>
        <PlayerScore name={opp?.name ?? 'Opponent'} score={oppScore} styles={styles} />
      </View>

      {mode === '3d' ? (
        <GameCanvas
          style={styles.arena3d}
          camera={RPS_CAMERA}
          onFallback={onFallback}
          fallback={null}
        >
          <RpsScene3D
            myPose={reveal && myPick ? myPick : 'fist'}
            oppPose={reveal && oppPick ? oppPick : 'fist'}
            shakeKey={reveal ? revealKey : 'idle'}
            onShakeDone={() => setShaking(false)}
            winner={
              reveal && !shaking && roundWinner ? (roundWinner === meId ? 'me' : 'opp') : null
            }
          />
        </GameCanvas>
      ) : (
      <View style={styles.arena}>
        <Animated.Text
          style={[styles.hand, styles.handLeft, { transform: [{ translateY: bob }, { scaleX: -1 }] }]}
        >
          {showHands && myPick ? HAND[myPick] : '✊'}
        </Animated.Text>
        <Text style={styles.vs}>VS</Text>
        <Animated.Text style={[styles.hand, styles.handRight, { transform: [{ translateY: bob }] }]}>
          {showHands && oppPick ? HAND[oppPick] : '✊'}
        </Animated.Text>
      </View>
      )}

      <Text style={styles.banner}>{banner}</Text>

      <View style={styles.dots}>
        {rps.history.map((h, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              h.winnerId === meId ? styles.dotWin : h.winnerId ? styles.dotLoss : styles.dotDraw,
            ]}
          />
        ))}
      </View>

      {rps.phase !== 'done' ? (
        <View style={styles.picks}>
          {CHOICES.map((c) => {
            const selected = iPicked && myPick == null ? false : myPick === c;
            const disabled = busy || iPicked || rps.phase !== 'picking';
            return (
              <Pressable
                key={c}
                onPress={() => onPick(c)}
                disabled={disabled}
                style={[styles.pickBtn, selected && styles.pickBtnOn, disabled && !selected && styles.pickBtnDim]}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${LABEL[c]}`}
              >
                <Text style={styles.pickEmoji}>{HAND[c]}</Text>
                <Text style={styles.pickLabel}>{LABEL[c]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function PlayerScore({
  name,
  score,
  you,
  styles,
}: {
  name: string;
  score: number;
  you?: boolean;
  styles: ReturnType<typeof rpsStyles>;
}) {
  return (
    <View style={styles.player}>
      <Text style={styles.playerName} numberOfLines={1}>
        {name}
        {you ? ' (You)' : ''}
      </Text>
      <Text style={styles.playerScore}>{score}</Text>
    </View>
  );
}

function rpsStyles(c: ThemeColors) {
  return {
    wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
    scoreRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const },
    player: { flex: 1, alignItems: 'center' as const },
    playerName: { color: c.textMuted, fontSize: 12, fontWeight: '600' as const, maxWidth: 110 },
    playerScore: { color: c.text, fontSize: 36, fontWeight: '800' as const, fontVariant: ['tabular-nums'] as any },
    roundBlock: { alignItems: 'center' as const, paddingHorizontal: 8 },
    roundLabel: { color: c.textDim, fontSize: 10, letterSpacing: 1.2, fontWeight: '800' as const },
    roundNum: { color: c.chrome, fontSize: 20, fontWeight: '800' as const },
    roundHint: { color: c.textDim, fontSize: 10 },
    arena: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-around' as const,
      marginTop: 28,
      paddingVertical: 24,
      borderRadius: 20,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    arena3d: { height: 250, marginTop: 20, backgroundColor: '#15181d', borderWidth: 1, borderColor: c.border },
    hand: { fontSize: 84 },
    handLeft: {},
    handRight: {},
    vs: { color: c.textDim, fontWeight: '900' as const, fontSize: 16, letterSpacing: 2 },
    banner: {
      marginTop: 18,
      textAlign: 'center' as const,
      color: c.text,
      fontSize: 16,
      fontWeight: '700' as const,
      minHeight: 22,
    },
    dots: { flexDirection: 'row' as const, justifyContent: 'center' as const, gap: 6, marginTop: 10, minHeight: 10 },
    dot: { width: 10, height: 10, borderRadius: 5 },
    dotWin: { backgroundColor: '#22c55e' },
    dotLoss: { backgroundColor: '#ef4444' },
    dotDraw: { backgroundColor: c.border },
    picks: { flexDirection: 'row' as const, gap: 10, marginTop: 'auto' as any, marginBottom: 16 },
    pickBtn: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 2,
      borderColor: c.border,
    },
    pickBtnOn: { borderColor: c.chrome, backgroundColor: c.chrome },
    pickBtnDim: { opacity: 0.45 },
    pickEmoji: { fontSize: 34 },
    pickLabel: { color: c.text, fontWeight: '700' as const, marginTop: 4, fontSize: 13 },
  };
}

