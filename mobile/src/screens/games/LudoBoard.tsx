import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { haptic } from '../../ui/haptics';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Polygon, Rect, Stop } from 'react-native-svg';
import { LudoColor, RoomView } from '../../api/games';
import { GameCanvas, supports3D } from '../../games/three/GameCanvas';
import { LUDO_CAMERA, LudoScene3D } from '../../games/three/LudoScene3D';

/**
 * Ludo Royal — glass shell + amber-framed board from the reference design.
 *
 * Brand bar, colour seat cards around the arena, status pill over the board,
 * and a footer roll control. Owns the whole screen like Chess / UNO.
 */

const C = {
  abyss: '#070b14',
  panel: 'rgba(15,23,42,0.88)',
  surface: 'rgba(30,41,59,0.9)',
  line: '#1e293b',
  lineSoft: 'rgba(51,65,85,0.8)',
  amber: '#f59e0b',
  amberText: '#fbbf24',
  amberBorder: '#d97706',
  boardBg: '#fffbeb',
  boardInset: '#fef08a',
  text: '#f1f5f9',
  muted: '#94a3b8',
  dim: '#64748b',
};

const DISPLAY_FONT = Platform.select({ ios: 'Avenir Next', default: 'sans-serif-medium' });

const COLOR_HEX: Record<LudoColor, string> = {
  red: '#f43f5e',
  green: '#22c55e',
  yellow: '#facc15',
  blue: '#0ea5e9',
};
const COLOR_DEEP: Record<LudoColor, string> = {
  red: '#be123c',
  green: '#15803d',
  yellow: '#ca8a04',
  blue: '#0369a1',
};
const COLOR_LABEL: Record<LudoColor, string> = {
  red: '#fb7185',
  green: '#34d399',
  yellow: '#fcd34d',
  blue: '#38bdf8',
};

const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const HOME_STEP = 57;

function buildTrack(): Array<[number, number]> {
  const t: Array<[number, number]> = [];
  for (let x = 1; x <= 5; x++) t.push([x, 6]);
  for (let y = 5; y >= 0; y--) t.push([6, y]);
  t.push([7, 0]);
  for (let y = 0; y <= 5; y++) t.push([8, y]);
  for (let x = 9; x <= 14; x++) t.push([x, 6]);
  t.push([14, 7]);
  for (let x = 14; x >= 9; x--) t.push([x, 8]);
  for (let y = 9; y <= 14; y++) t.push([8, y]);
  t.push([7, 14]);
  for (let y = 14; y >= 9; y--) t.push([6, y]);
  for (let x = 5; x >= 0; x--) t.push([x, 8]);
  t.push([0, 7]);
  t.push([0, 6]);
  return t;
}
const TRACK = buildTrack();
if (TRACK.length !== 52) throw new Error(`Ludo track must have 52 squares, has ${TRACK.length}`);

const HOME_COL: Record<LudoColor, Array<[number, number]>> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};
const HOME_SEAT: Record<LudoColor, [number, number]> = {
  red: [6.8, 7.5],
  green: [7.5, 6.8],
  yellow: [8.2, 7.5],
  blue: [7.5, 8.2],
};
const BASE_ORIGIN: Record<LudoColor, [number, number]> = {
  red: [0, 0],
  green: [9, 0],
  yellow: [9, 9],
  blue: [0, 9],
};
const BASE_SLOTS: Array<[number, number]> = [[2, 2], [4, 2], [2, 4], [4, 4]];

function cellFor(color: LudoColor, step: number, tokenIndex: number): [number, number] {
  if (step < 0) {
    const [bx, by] = BASE_ORIGIN[color];
    const [sx, sy] = BASE_SLOTS[tokenIndex];
    return [bx + sx, by + sy];
  }
  if (step <= 50) {
    const [x, y] = TRACK[(START[color] + step) % 52];
    return [x + 0.5, y + 0.5];
  }
  if (step <= 56) {
    const [x, y] = HOME_COL[color][step - 51];
    return [x + 0.5, y + 0.5];
  }
  return HOME_SEAT[color];
}

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
  onRoll: () => void;
  onMove: (tokenIndex: number) => void;
  busy: boolean;
  mode?: '2d' | '3d';
  subtitle?: string;
  onModeChange?: (mode: '2d' | '3d') => void;
  onLeave?: () => void;
  onFallback?: () => void;
  leaveLabel?: string;
};

export function LudoBoard({
  room,
  meId,
  onRoll,
  onMove,
  busy,
  mode = '2d',
  subtitle,
  onModeChange,
  onLeave,
  onFallback,
  leaveLabel = 'Leave the match',
}: Props) {
  const { width, height } = useWindowDimensions();
  const chrome = 210;
  const size = Math.min(width - 28, height - chrome, 420);
  const cell = size / 15;
  const st = room.ludo!;
  const current = st.turnOrder[st.turnIndex];
  const myTurn = current === meId && st.phase !== 'done';
  const myColor = st.colors[meId];
  const nameOf = (id: string) => room.players.find((p) => p.userId === id)?.name ?? '…';

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!room.deadline || st.phase === 'done') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [room.deadline, st.phase]);
  const secondsLeft = room.deadline ? Math.max(0, Math.ceil((room.deadline - now) / 1000)) : null;

  const spin = useRef(new Animated.Value(0)).current;
  const lastVersion = useRef(st.version);
  useEffect(() => {
    if (st.version === lastVersion.current) return;
    lastVersion.current = st.version;
    if (st.dice == null) return;
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 420, useNativeDriver: true }).start();
  }, [st.version, st.dice, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const tokens = useMemo(() => {
    const out: Array<{
      userId: string;
      color: LudoColor;
      index: number;
      step: number;
      x: number;
      y: number;
      movable: boolean;
    }> = [];
    for (const uid of st.turnOrder) {
      const color = st.colors[uid];
      st.tokens[uid].forEach((step, i) => {
        const [cx, cy] = cellFor(color, step, i);
        out.push({
          userId: uid,
          color,
          index: i,
          step,
          x: cx * cell,
          y: cy * cell,
          movable: myTurn && uid === meId && st.phase === 'move' && st.movable.includes(i),
        });
      });
    }
    const groups = new Map<string, typeof out>();
    for (const t of out) {
      const k = `${Math.round(t.x)}:${Math.round(t.y)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(t);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const off = cell * 0.18;
      g.forEach((t, i) => {
        t.x += ((i % 2) - 0.5) * off * 2;
        t.y += (Math.floor(i / 2) - 0.5) * off * 2;
      });
    }
    return out;
  }, [st, cell, myTurn, meId]);

  const canSwitchView = !!onModeChange && supports3D();
  const canRoll = myTurn && st.phase === 'roll' && !busy;
  const currentColor = st.colors[current];

  const status =
    st.phase === 'done'
      ? st.winnerId === meId
        ? '🏆 You won!'
        : `${nameOf(st.winnerId ?? '')} won the game`
      : myTurn
        ? st.phase === 'roll'
          ? 'Your turn — roll (1 or 6 leaves base)'
          : 'Tap a highlighted token to move'
        : `${nameOf(current)}'s turn`;

  const footerHint =
    st.phase === 'done'
      ? 'Match over'
      : myTurn
        ? st.phase === 'roll'
          ? 'Tap Roll Dice (6 opens a token!)'
          : 'Choose a glowing token'
        : `Waiting on ${nameOf(current)}`;

  // Seat layout: two on top, two on bottom when 3–4 players; side-by-side for 2.
  const seats = st.turnOrder;
  const topSeats = seats.length <= 2 ? seats : seats.slice(0, Math.ceil(seats.length / 2));
  const bottomSeats = seats.length <= 2 ? [] : seats.slice(Math.ceil(seats.length / 2));

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.brandBadge}>
            <View style={styles.brandBadgeInner}>
              <Text style={styles.brandEmoji}>🎲</Text>
            </View>
          </View>
          <View style={styles.brandText}>
            <Text style={styles.wordmark}>LUDO ROYAL</Text>
            <Text style={styles.wordmarkSub} numberOfLines={1}>
              {subtitle ?? `${seats.length} players · Classic`}
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

      <View style={styles.seatRow}>
        {topSeats.map((uid) => (
          <SeatCard
            key={uid}
            name={uid === meId ? 'You' : nameOf(uid)}
            color={st.colors[uid]}
            home={st.tokens[uid].filter((s) => s === HOME_STEP).length}
            active={uid === current && st.phase !== 'done'}
            isYou={uid === meId}
          />
        ))}
      </View>

      <View style={styles.arena}>
        <View style={styles.statusPill} pointerEvents="none">
          <View style={[styles.statusDot, { backgroundColor: COLOR_HEX[currentColor] }]} />
          <Text style={styles.statusText} numberOfLines={1}>
            {status}
          </Text>
        </View>

        {mode === '3d' ? (
          <GameCanvas
            style={[styles.canvas3d, { height: Math.round(size * 0.92) }]}
            camera={LUDO_CAMERA}
            onFallback={onFallback}
            fallback={null}
          >
            <LudoScene3D
              state={st}
              meId={meId}
              myTurn={myTurn}
              onMove={(i) => {
                if (!busy) onMove(i);
              }}
              onRoll={() => {
                if (!busy) onRoll();
              }}
            />
          </GameCanvas>
        ) : (
          <View style={[styles.boardFrame, { width: size, height: size }]}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <BoardSvg cell={cell} colorsInPlay={new Set(Object.values(st.colors))} />
              {tokens.map((t) => (
                <G key={`${t.userId}-${t.index}`}>
                  {t.movable ? (
                    <Circle
                      cx={t.x}
                      cy={t.y}
                      r={cell * 0.52}
                      fill="none"
                      stroke="#facc15"
                      strokeWidth={2.4}
                      opacity={0.95}
                    />
                  ) : null}
                  <Circle
                    cx={t.x}
                    cy={t.y}
                    r={cell * 0.36}
                    fill={COLOR_HEX[t.color]}
                    stroke="#0f172a"
                    strokeWidth={1.4}
                  />
                  <Circle
                    cx={t.x - cell * 0.1}
                    cy={t.y - cell * 0.1}
                    r={cell * 0.1}
                    fill="rgba(255,255,255,0.6)"
                  />
                </G>
              ))}
            </Svg>
            {tokens
              .filter((t) => t.movable)
              .map((t) => (
                <Pressable
                  key={`tap-${t.index}`}
                  onPress={() => onMove(t.index)}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={`Move token ${t.index + 1}`}
                  style={{
                    position: 'absolute',
                    left: t.x - cell * 0.7,
                    top: t.y - cell * 0.7,
                    width: cell * 1.4,
                    height: cell * 1.4,
                    borderRadius: cell * 0.7,
                  }}
                />
              ))}
          </View>
        )}
      </View>

      {bottomSeats.length > 0 ? (
        <View style={styles.seatRow}>
          {bottomSeats.map((uid) => (
            <SeatCard
              key={uid}
              name={uid === meId ? 'You' : nameOf(uid)}
              color={st.colors[uid]}
              home={st.tokens[uid].filter((s) => s === HOME_STEP).length}
              active={uid === current && st.phase !== 'done'}
              isYou={uid === meId}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <View style={styles.footerText}>
          <Text style={styles.footerTitle} numberOfLines={1}>
            {st.phase === 'done'
              ? 'Game Over'
              : myTurn
                ? 'Your Turn'
                : `${nameOf(current)}'s Turn`}
          </Text>
          <Text style={styles.footerHint} numberOfLines={1}>
            {footerHint}
            {secondsLeft != null && st.phase !== 'done' ? ` · ${secondsLeft}s` : ''}
          </Text>
          {st.lastEvent ? (
            <Text style={styles.footerEvent} numberOfLines={1}>
              {st.lastEvent}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => {
            haptic('medium');
            onRoll();
          }}
          disabled={!canRoll}
          style={[
            styles.rollBtn,
            {
              backgroundColor: myColor ? COLOR_HEX[myColor] : COLOR_HEX.red,
              borderColor: '#fff',
              opacity: canRoll ? 1 : 0.45,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={st.dice ? `Dice showing ${st.dice}` : 'Roll dice'}
        >
          <Animated.View style={[styles.diceFace, { transform: [{ rotate }] }]}>
            {st.dice != null ? (
              <Text style={styles.diceFaceNum}>{st.dice}</Text>
            ) : (
              <Text style={styles.diceFaceEmoji}>🎲</Text>
            )}
          </Animated.View>
          <Text style={styles.rollLabel}>{st.dice != null ? `ROLLED ${st.dice}` : 'ROLL DICE'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SeatCard({
  name,
  color,
  home,
  active,
  isYou,
}: {
  name: string;
  color: LudoColor;
  home: number;
  active: boolean;
  isYou: boolean;
}) {
  return (
    <View style={[styles.seat, active && { borderColor: COLOR_HEX[color] }]}>
      <View style={styles.seatLeft}>
        <View style={[styles.seatDot, { backgroundColor: COLOR_HEX[color] }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.seatName, { color: COLOR_LABEL[color] }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.seatHome}>
            {home}/4
          </Text>
        </View>
      </View>
      <Text style={styles.seatBadge}>{isYou ? 'YOU' : active ? 'TURN' : ''}</Text>
    </View>
  );
}

function BoardSvg({ cell, colorsInPlay }: { cell: number; colorsInPlay: Set<LudoColor> }) {
  const s = cell;
  const base = (color: LudoColor) => {
    const [x, y] = BASE_ORIGIN[color];
    const dim = !colorsInPlay.has(color);
    const gid = `base${color}`;
    return (
      <G key={color} opacity={dim ? 0.35 : 1}>
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={COLOR_HEX[color]} />
            <Stop offset="1" stopColor={COLOR_DEEP[color]} />
          </LinearGradient>
        </Defs>
        <Rect x={x * s} y={y * s} width={6 * s} height={6 * s} fill={`url(#${gid})`} />
        <Rect
          x={(x + 1) * s}
          y={(y + 1) * s}
          width={4 * s}
          height={4 * s}
          rx={s * 0.4}
          fill="#fffbeb"
        />
        {BASE_SLOTS.map(([sx, sy], i) => (
          <Circle
            key={i}
            cx={(x + sx) * s}
            cy={(y + sy) * s}
            r={s * 0.42}
            fill="none"
            stroke={COLOR_HEX[color]}
            strokeWidth={2}
          />
        ))}
      </G>
    );
  };
  const trackCells = TRACK.map(([x, y], i) => {
    const startColor = (Object.keys(START) as LudoColor[]).find((c) => START[c] === i);
    const fill = startColor ? COLOR_HEX[startColor] : '#fef3c7';
    return (
      <G key={`t${i}`}>
        <Rect
          x={x * s}
          y={y * s}
          width={s}
          height={s}
          fill={fill}
          stroke="rgba(15,23,42,0.18)"
          strokeWidth={0.6}
        />
        {SAFE.has(i) && !startColor ? (
          <Polygon
            points={star(x * s + s / 2, y * s + s / 2, s * 0.34, s * 0.15)}
            fill="#d97706"
            opacity={0.75}
          />
        ) : null}
      </G>
    );
  });
  const homeCols = (Object.keys(HOME_COL) as LudoColor[]).flatMap((color) =>
    HOME_COL[color].slice(0, 5).map(([x, y], i) => (
      <Rect
        key={`${color}h${i}`}
        x={x * s}
        y={y * s}
        width={s}
        height={s}
        fill={COLOR_HEX[color]}
        stroke="rgba(15,23,42,0.18)"
        strokeWidth={0.6}
      />
    )),
  );
  return (
    <G>
      <Rect x={0} y={0} width={15 * s} height={15 * s} fill={C.boardBg} rx={s * 0.35} />
      {(['red', 'green', 'yellow', 'blue'] as LudoColor[]).map(base)}
      {trackCells}
      {homeCols}
      <Polygon points={`${6 * s},${6 * s} ${9 * s},${6 * s} ${7.5 * s},${7.5 * s}`} fill={COLOR_HEX.green} />
      <Polygon points={`${9 * s},${6 * s} ${9 * s},${9 * s} ${7.5 * s},${7.5 * s}`} fill={COLOR_HEX.yellow} />
      <Polygon points={`${9 * s},${9 * s} ${6 * s},${9 * s} ${7.5 * s},${7.5 * s}`} fill={COLOR_HEX.blue} />
      <Polygon points={`${6 * s},${9 * s} ${6 * s},${6 * s} ${7.5 * s},${7.5 * s}`} fill={COLOR_HEX.red} />
      <Line x1={6 * s} y1={6 * s} x2={9 * s} y2={9 * s} stroke="#fff" strokeWidth={1} />
      <Line x1={9 * s} y1={6 * s} x2={6 * s} y2={9 * s} stroke="#fff" strokeWidth={1} />
    </G>
  );
}

function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
  }
  return pts.join(' ');
}

export function ludoColorHex(color: LudoColor | undefined): string {
  return color ? COLOR_HEX[color] : '#999';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.abyss,
    paddingHorizontal: 12,
    paddingTop: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  brandBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    padding: 2,
    backgroundColor: C.amber,
  },
  brandBadgeInner: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: C.abyss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandEmoji: { fontSize: 14 },
  brandText: { flex: 1, minWidth: 0 },
  wordmark: {
    color: C.amberText,
    fontFamily: DISPLAY_FONT,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  wordmarkSub: { color: C.muted, fontSize: 10, marginTop: 1 },
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
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  seatRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  seat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: C.panel,
    borderWidth: 2,
    borderColor: C.line,
  },
  seatLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  seatDot: { width: 10, height: 10, borderRadius: 5 },
  seatName: { fontSize: 12, fontWeight: '800' },
  seatHome: { color: C.muted, fontSize: 10, marginTop: 1 },
  seatBadge: {
    color: C.dim,
    fontFamily: DISPLAY_FONT,
    fontSize: 10,
    fontWeight: '800',
  },
  arena: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    minHeight: 200,
  },
  statusPill: {
    position: 'absolute',
    top: 4,
    zIndex: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.lineSoft,
    maxWidth: '92%',
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: C.text, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  boardFrame: {
    alignSelf: 'center',
    borderRadius: 18,
    borderWidth: 6,
    borderColor: C.amberBorder,
    backgroundColor: C.boardBg,
    overflow: 'hidden',
    shadowColor: C.amber,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  canvas3d: {
    width: '100%',
    backgroundColor: '#101216',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.lineSoft,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
  },
  footerText: { flex: 1, minWidth: 0 },
  footerTitle: { color: C.text, fontFamily: DISPLAY_FONT, fontSize: 14, fontWeight: '800' },
  footerHint: { color: C.muted, fontSize: 11, marginTop: 2 },
  footerEvent: { color: C.dim, fontSize: 10, marginTop: 2 },
  rollBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 16,
    borderWidth: 2,
  },
  diceFace: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  diceFaceNum: { color: '#0f172a', fontFamily: DISPLAY_FONT, fontSize: 18, fontWeight: '800' },
  diceFaceEmoji: { fontSize: 18 },
  rollLabel: {
    color: '#fff',
    fontFamily: DISPLAY_FONT,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
