import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { RoomView, RpsChoice } from '../../api/games';
import { GameCanvas, supports3D } from '../../games/three/GameCanvas';
import { RPS_CAMERA, RpsScene3D } from '../../games/three/RpsScene3D';

/**
 * Stone Paper Scissors — arcade glass shell from the reference design.
 *
 * Brand bar, rose/sky scoreboard, fighter hand cards (or the 3D arena), a
 * status pill, history dots, and the three choice pads. Owns the whole
 * screen the way Chess / UNO do.
 */

const C = {
  abyss: '#020617',
  panel: 'rgba(15,23,42,0.86)',
  surface: 'rgba(30,41,59,0.9)',
  line: '#1e293b',
  lineSoft: 'rgba(51,65,85,0.8)',
  amber: '#f59e0b',
  amberText: '#fbbf24',
  emerald: '#34d399',
  sky: '#38bdf8',
  skySoft: 'rgba(14,165,233,0.2)',
  skyEdge: 'rgba(14,165,233,0.4)',
  rose: '#fb7185',
  roseSoft: 'rgba(244,63,94,0.2)',
  roseEdge: 'rgba(244,63,94,0.4)',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
};

const DISPLAY_FONT = Platform.select({ ios: 'Avenir Next', default: 'sans-serif-medium' });

const HAND: Record<RpsChoice, string> = { stone: '✊', paper: '✋', scissors: '✌️' };
const LABEL: Record<RpsChoice, string> = { stone: 'Stone', paper: 'Paper', scissors: 'Scissors' };
const HINT: Record<RpsChoice, string> = {
  stone: 'Beats Scissors',
  paper: 'Beats Stone',
  scissors: 'Beats Paper',
};
const CHOICE_EDGE: Record<RpsChoice, string> = {
  stone: C.amber,
  paper: C.sky,
  scissors: C.rose,
};
const CHOICES: RpsChoice[] = ['stone', 'paper', 'scissors'];

function ExitIcon({ size = 16, color = C.muted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

type Props = {
  room: RoomView;
  meId: string;
  onPick: (choice: RpsChoice) => void;
  busy: boolean;
  mode?: '2d' | '3d';
  subtitle?: string;
  onModeChange?: (mode: '2d' | '3d') => void;
  onLeave?: () => void;
  onFallback?: () => void;
  /** Spectating uses a different leave label. */
  leaveLabel?: string;
};

export function RpsBoard({
  room,
  meId,
  onPick,
  busy,
  mode = '2d',
  subtitle,
  onModeChange,
  onLeave,
  onFallback,
  leaveLabel = 'Leave the match',
}: Props) {
  const rps = room.rps!;
  const opponentId = rps.playerIds.find((id) => id !== meId) ?? rps.playerIds[1];
  const me = room.players.find((p) => p.userId === meId);
  const opp = room.players.find((p) => p.userId === opponentId);
  const reveal = rps.phase !== 'picking' && rps.lastResult;
  const myPick = reveal ? rps.lastResult!.picks[meId] : null;
  const oppPick = reveal ? rps.lastResult!.picks[opponentId] : null;
  const iPicked = rps.picked[meId];
  const oppPicked = rps.picked[opponentId];

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

  const myScore =
    shaking && rps.lastResult?.winnerId === meId
      ? Math.max(0, (rps.scores[meId] ?? 0) - 1)
      : (rps.scores[meId] ?? 0);
  const oppScore =
    shaking && rps.lastResult?.winnerId === opponentId
      ? Math.max(0, (rps.scores[opponentId] ?? 0) - 1)
      : (rps.scores[opponentId] ?? 0);
  const displayHistory = shaking ? rps.history.slice(0, -1) : rps.history;

  const roundWinner = rps.lastResult?.winnerId;
  const banner =
    rps.phase === 'done' && !shaking
      ? rps.winnerId === meId
        ? '🏆 You won the match!'
        : `${opp?.name ?? 'Opponent'} won the match`
      : reveal && !shaking
        ? roundWinner == null
          ? 'Draw — play again'
          : roundWinner === meId
            ? 'You win this round!'
            : `${opp?.name ?? 'Opponent'} wins this round`
        : reveal && shaking
          ? 'Stone… Paper… Scissors…'
          : iPicked && !oppPicked
            ? `Waiting for ${opp?.name ?? 'opponent'}…`
            : 'Make your pick';

  const bannerTone =
    rps.phase === 'done' && rps.winnerId === meId
      ? 'win'
      : reveal && !shaking && roundWinner === meId
        ? 'win'
        : reveal && !shaking && roundWinner && roundWinner !== meId
          ? 'loss'
          : reveal && shaking
            ? 'live'
            : 'idle';

  const canSwitchView = !!onModeChange && supports3D();
  const myWin = reveal && !shaking && roundWinner === meId;
  const oppWin = reveal && !shaking && !!roundWinner && roundWinner !== meId;

  const streak = displayHistory.reduce((n, h) => (h.winnerId === meId ? n + 1 : 0), 0);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandBadge}>
            <View style={styles.brandBadgeInner}>
              <Text style={styles.brandEmoji}>✊</Text>
            </View>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.wordmark}>STONE PAPER SCISSORS</Text>
            <Text style={styles.wordmarkSub} numberOfLines={1}>
              {subtitle ?? `First to ${rps.winsNeeded} wins`}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          {canSwitchView ? (
            <View style={styles.segment}>
              {(['3d', '2d'] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => onModeChange?.(option)}
                  style={[styles.segmentBtn, mode === option && styles.segmentBtnOn]}
                  accessibilityRole="button"
                  accessibilityLabel={option === '3d' ? 'Switch to 3D view' : 'Switch to 2D board'}
                >
                  <Text style={[styles.segmentText, mode === option && styles.segmentTextOn]}>
                    {option.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {onLeave ? (
            <Pressable
              onPress={onLeave}
              style={styles.leaveBtn}
              accessibilityRole="button"
              accessibilityLabel={leaveLabel}
            >
              <ExitIcon />
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.scoreCard}>
        <View style={styles.scoreSide}>
          <View style={[styles.avatar, styles.avatarMe]}>
            <Text style={[styles.avatarText, { color: C.rose }]}>P1</Text>
          </View>
          <View>
            <Text style={styles.scoreLabel} numberOfLines={1}>
              {me?.name ?? 'You'}
            </Text>
            <Text style={styles.scoreValue}>{myScore}</Text>
          </View>
        </View>

        <View style={styles.targetBadge}>
          <Text style={styles.targetEyebrow}>ROUND</Text>
          <Text style={styles.targetValue}>
            {Math.min(rps.round, rps.maxRounds)}/{rps.maxRounds}
          </Text>
          <Text style={styles.targetHint}>First to {rps.winsNeeded}</Text>
          {streak > 0 ? <Text style={styles.streak}>Streak: {streak}</Text> : null}
        </View>

        <View style={[styles.scoreSide, styles.scoreSideRight]}>
          <View>
            <Text style={[styles.scoreLabel, styles.alignRight]} numberOfLines={1}>
              {opp?.name ?? 'Opponent'}
            </Text>
            <Text style={[styles.scoreValue, styles.alignRight]}>{oppScore}</Text>
          </View>
          <View style={[styles.avatar, styles.avatarOpp]}>
            <Text style={[styles.avatarText, { color: C.sky }]}>P2</Text>
          </View>
        </View>
      </View>

      <View style={[styles.statusPill, bannerTone === 'win' && styles.statusPillWin, bannerTone === 'loss' && styles.statusPillLoss]}>
        <Text
          style={[
            styles.statusText,
            bannerTone === 'win' && styles.statusWin,
            bannerTone === 'loss' && styles.statusLoss,
            bannerTone === 'live' && styles.statusLive,
          ]}
          numberOfLines={2}
        >
          {banner}
        </Text>
      </View>

      {mode === '3d' ? (
        <View style={styles.arena3dWrap}>
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
          <View style={styles.arena3dLabels} pointerEvents="none">
            <Text style={[styles.chip, styles.chipMe]}>
              You{showHands && myPick ? `: ${LABEL[myPick]}` : iPicked ? ': locked' : ''}
            </Text>
            <Text style={[styles.chip, styles.chipOpp]}>
              {opp?.name ?? 'Opp'}
              {showHands && oppPick ? `: ${LABEL[oppPick]}` : oppPicked ? ': locked' : ''}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.arena}>
          <Animated.View
            style={[
              styles.handCard,
              styles.handCardMe,
              myWin && styles.handCardGlow,
              { transform: [{ translateY: bob }] },
            ]}
          >
            <Text style={[styles.handTag, { color: C.rose }]}>You</Text>
            <Text style={[styles.handEmoji, { transform: [{ scaleX: -1 }] }]}>
              {showHands && myPick ? HAND[myPick] : '✊'}
            </Text>
            <Text style={styles.handName}>
              {showHands && myPick ? LABEL[myPick] : iPicked ? 'Locked' : 'Ready'}
            </Text>
          </Animated.View>

          <View style={styles.vsCircle}>
            <Text style={styles.vsText}>VS</Text>
          </View>

          <Animated.View
            style={[
              styles.handCard,
              styles.handCardOpp,
              oppWin && styles.handCardGlow,
              { transform: [{ translateY: bob }] },
            ]}
          >
            <Text style={[styles.handTag, { color: C.sky }]} numberOfLines={1}>
              {opp?.name ?? 'Opponent'}
            </Text>
            <Text style={styles.handEmoji}>{showHands && oppPick ? HAND[oppPick] : '✊'}</Text>
            <Text style={styles.handName}>
              {showHands && oppPick ? LABEL[oppPick] : oppPicked ? 'Locked' : 'Ready'}
            </Text>
          </Animated.View>
        </View>
      )}

      <View style={styles.historyRow}>
        <Text style={styles.historyLabel}>History</Text>
        {displayHistory.length === 0 ? (
          <View style={styles.dotEmpty} />
        ) : (
          displayHistory.map((h, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                h.winnerId === meId ? styles.dotWin : h.winnerId ? styles.dotLoss : styles.dotDraw,
              ]}
            />
          ))
        )}
      </View>

      {rps.phase !== 'done' ? (
        <View style={styles.picks}>
          {CHOICES.map((c) => {
            const selected = iPicked && myPick == null ? false : myPick === c;
            const lockedIn = iPicked && !reveal;
            const disabled = busy || iPicked || rps.phase !== 'picking';
            return (
              <Pressable
                key={c}
                onPress={() => onPick(c)}
                disabled={disabled}
                style={[
                  styles.pickBtn,
                  selected && { borderColor: CHOICE_EDGE[c], backgroundColor: C.surface },
                  lockedIn && !selected && styles.pickBtnDim,
                  disabled && !selected && styles.pickBtnDim,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Pick ${LABEL[c]}`}
              >
                <Text style={styles.pickEmoji}>{HAND[c]}</Text>
                <Text style={styles.pickLabel}>{LABEL[c].toUpperCase()}</Text>
                <Text style={styles.pickHint}>{HINT[c]}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.abyss,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  brandBadge: {
    width: 36,
    height: 36,
    borderRadius: 14,
    padding: 2,
    backgroundColor: C.amber,
  },
  brandBadgeInner: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: C.abyss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandEmoji: { fontSize: 16 },
  brandText: { flex: 1, minWidth: 0 },
  wordmark: {
    color: C.amberText,
    fontFamily: DISPLAY_FONT,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  wordmarkSub: { color: C.muted, fontSize: 11, marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  segment: {
    flexDirection: 'row',
    backgroundColor: C.line,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.lineSoft,
    padding: 2,
  },
  segmentBtn: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 },
  segmentBtnOn: { backgroundColor: C.amber },
  segmentText: { color: C.muted, fontSize: 11, fontWeight: '800', fontFamily: DISPLAY_FONT },
  segmentTextOn: { color: C.abyss },
  leaveBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.panel,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.lineSoft,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  scoreSide: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  scoreSideRight: { justifyContent: 'flex-end' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarMe: { backgroundColor: C.roseSoft, borderColor: C.roseEdge },
  avatarOpp: { backgroundColor: C.skySoft, borderColor: C.skyEdge },
  avatarText: { fontFamily: DISPLAY_FONT, fontWeight: '800', fontSize: 12 },
  scoreLabel: { color: C.muted, fontSize: 11, fontWeight: '600', maxWidth: 72 },
  scoreValue: {
    color: C.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  alignRight: { textAlign: 'right' },
  targetBadge: {
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(15,23,42,0.9)',
    borderWidth: 1,
    borderColor: C.line,
  },
  targetEyebrow: {
    color: C.dim,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  targetValue: {
    color: C.amberText,
    fontFamily: DISPLAY_FONT,
    fontSize: 14,
    fontWeight: '800',
  },
  targetHint: { color: C.dim, fontSize: 10, marginTop: 1 },
  streak: { color: C.emerald, fontSize: 10, fontWeight: '700', marginTop: 2 },
  statusPill: {
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    maxWidth: '100%',
  },
  statusPillWin: { borderColor: 'rgba(52,211,153,0.45)' },
  statusPillLoss: { borderColor: 'rgba(251,113,133,0.45)' },
  statusText: {
    color: C.text,
    fontFamily: DISPLAY_FONT,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  statusWin: { color: C.emerald },
  statusLoss: { color: C.rose },
  statusLive: { color: C.amberText },
  arena: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 4,
    flex: 1,
  },
  handCard: {
    width: 118,
    height: 148,
    borderRadius: 22,
    backgroundColor: C.panel,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  handCardMe: { borderColor: C.roseEdge },
  handCardOpp: { borderColor: C.skyEdge },
  handCardGlow: {
    borderColor: C.amberText,
    shadowColor: C.amber,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  handTag: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  handEmoji: { fontSize: 52, lineHeight: 60 },
  handName: { color: '#cbd5e1', fontSize: 12, fontWeight: '700', marginTop: 6 },
  vsCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.line,
    borderWidth: 1,
    borderColor: C.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vsText: {
    color: C.amberText,
    fontFamily: DISPLAY_FONT,
    fontSize: 11,
    fontWeight: '800',
  },
  arena3dWrap: {
    flex: 1,
    marginTop: 4,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.lineSoft,
    backgroundColor: C.panel,
    minHeight: 200,
  },
  arena3d: { flex: 1, backgroundColor: '#0b1220' },
  arena3dLabels: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    fontSize: 11,
    fontWeight: '700',
  },
  chipMe: {
    backgroundColor: 'rgba(76,5,25,0.8)',
    borderWidth: 1,
    borderColor: C.roseEdge,
    color: '#fda4af',
  },
  chipOpp: {
    backgroundColor: 'rgba(8,47,73,0.8)',
    borderWidth: 1,
    borderColor: C.skyEdge,
    color: '#7dd3fc',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
    minHeight: 14,
  },
  historyLabel: {
    color: C.dim,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginRight: 2,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.line,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  dotWin: { backgroundColor: C.emerald },
  dotLoss: { backgroundColor: '#f43f5e' },
  dotDraw: { backgroundColor: C.lineSoft },
  picks: { flexDirection: 'row', gap: 10 },
  pickBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.lineSoft,
  },
  pickBtnDim: { opacity: 0.4 },
  pickEmoji: { fontSize: 30, lineHeight: 36 },
  pickLabel: {
    color: C.text,
    fontFamily: DISPLAY_FONT,
    fontWeight: '800',
    marginTop: 4,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  pickHint: { color: C.dim, fontSize: 9, marginTop: 2 },
});
