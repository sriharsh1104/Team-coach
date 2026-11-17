import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Rect } from 'react-native-svg';
import { LudoColor, RoomView } from '../../api/games';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { GameCanvas } from '../../games/three/GameCanvas';
import { LUDO_CAMERA, LudoScene3D } from '../../games/three/LudoScene3D';

const COLOR_HEX: Record<LudoColor, string> = {
  red: '#e74c3c',
  green: '#27ae60',
  yellow: '#f1c40f',
  blue: '#2980b9',
};
const START: Record<LudoColor, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const HOME_STEP = 57;

// 15×15 grid, x = column, y = row. Bases: red top-left, green top-right,
// yellow bottom-right, blue bottom-left. The shared track runs clockwise
// starting at red's start square (1,6); colour starts land on indexes
// 0 / 13 / 26 / 39 by construction.
function buildTrack(): Array<[number, number]> {
  const t: Array<[number, number]> = [];
  for (let x = 1; x <= 5; x++) t.push([x, 6]); // 0-4   red arm →
  for (let y = 5; y >= 0; y--) t.push([6, y]); // 5-10  up
  t.push([7, 0]); // 11
  for (let y = 0; y <= 5; y++) t.push([8, y]); // 12-17 down (green start = 13 → (8,1))
  for (let x = 9; x <= 14; x++) t.push([x, 6]); // 18-23 →
  t.push([14, 7]); // 24
  for (let x = 14; x >= 9; x--) t.push([x, 8]); // 25-30 ← (yellow start = 26 → (13,8))
  for (let y = 9; y <= 14; y++) t.push([8, y]); // 31-36 down
  t.push([7, 14]); // 37
  for (let y = 14; y >= 9; y--) t.push([6, y]); // 38-43 up (blue start = 39 → (6,13))
  for (let x = 5; x >= 0; x--) t.push([x, 8]); // 44-49 ←
  t.push([0, 7]); // 50
  t.push([0, 6]); // 51
  return t;
}
const TRACK = buildTrack();
if (TRACK.length !== 52) throw new Error(`Ludo track must have 52 squares, has ${TRACK.length}`);

// Home columns: 5 coloured squares + the centre cell, from the track entry inward.
const HOME_COL: Record<LudoColor, Array<[number, number]>> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
};
/** Where a finished token sits inside the centre triangle of its colour. */
const HOME_SEAT: Record<LudoColor, [number, number]> = {
  red: [6.8, 7.5],
  green: [7.5, 6.8],
  yellow: [8.2, 7.5],
  blue: [7.5, 8.2],
};
// Base (yard) top-left cell of each 6×6 block.
const BASE_ORIGIN: Record<LudoColor, [number, number]> = {
  red: [0, 0],
  green: [9, 0],
  yellow: [9, 9],
  blue: [0, 9],
};
const BASE_SLOTS: Array<[number, number]> = [[2, 2], [4, 2], [2, 4], [4, 4]];

/** Grid cell (col=x, row=y) for a token at `step` of colour `color`. */
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

type Props = {
  room: RoomView;
  meId: string;
  onRoll: () => void;
  onMove: (tokenIndex: number) => void;
  busy: boolean;
  /** 3D board (expo-gl) or the flat SVG board. */
  mode?: '2d' | '3d';
  onFallback?: () => void;
};

export function LudoBoard({ room, meId, onRoll, onMove, busy, mode = '2d', onFallback }: Props) {
  const styles = useThemedStyles(ludoStyles);
  const { width } = useWindowDimensions();
  const size = Math.min(width - 24, 420);
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

  // Dice tumble on every new roll.
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
    const out: Array<{ userId: string; color: LudoColor; index: number; step: number; x: number; y: number; movable: boolean }> = [];
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
    // Spread tokens that share a square so stacks stay visible.
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

  return (
    <View style={styles.wrap}>
      <View style={styles.turnRow}>
        {st.turnOrder.map((uid) => {
          const active = uid === current;
          return (
            <View key={uid} style={[styles.seat, active && styles.seatActive]}>
              <View style={[styles.seatDot, { backgroundColor: COLOR_HEX[st.colors[uid]] }]} />
              <Text style={[styles.seatName, active && styles.seatNameActive]} numberOfLines={1}>
                {uid === meId ? 'You' : nameOf(uid)}
              </Text>
              <Text style={styles.seatHome}>{st.tokens[uid].filter((s) => s === HOME_STEP).length}/4</Text>
            </View>
          );
        })}
      </View>

      {mode === '3d' ? (
        <GameCanvas
          style={{ height: Math.round(size * 0.92), backgroundColor: '#101216' }}
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
      <View style={{ width: size, height: size, alignSelf: 'center' }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <BoardSvg cell={cell} colorsInPlay={new Set(Object.values(st.colors))} />
          {tokens.map((t) => (
            <G key={`${t.userId}-${t.index}`}>
              {t.movable ? (
                <Circle cx={t.x} cy={t.y} r={cell * 0.5} fill="none" stroke="#fff" strokeWidth={2} opacity={0.9} />
              ) : null}
              <Circle cx={t.x} cy={t.y} r={cell * 0.36} fill={COLOR_HEX[t.color]} stroke="#111" strokeWidth={1.2} />
              <Circle cx={t.x - cell * 0.1} cy={t.y - cell * 0.1} r={cell * 0.1} fill="rgba(255,255,255,0.55)" />
            </G>
          ))}
        </Svg>
        {/* Tap targets over movable tokens (SVG onPress is flaky across RN versions). */}
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

      <View style={styles.controls}>
        <View style={styles.statusCol}>
          <Text style={styles.status} numberOfLines={2}>
            {st.phase === 'done'
              ? st.winnerId === meId
                ? '🏆 You won!'
                : `${nameOf(st.winnerId ?? '')} won the game`
              : myTurn
                ? st.phase === 'roll'
                  ? 'Your turn — roll the dice'
                  : 'Tap a highlighted token to move'
                : `${nameOf(current)}'s turn`}
          </Text>
          {st.lastEvent ? <Text style={styles.event}>{st.lastEvent}</Text> : null}
          {secondsLeft != null && st.phase !== 'done' ? (
            <Text style={[styles.timer, secondsLeft <= 5 && styles.timerLow]}>{secondsLeft}s</Text>
          ) : null}
        </View>
        <Pressable
          onPress={onRoll}
          disabled={!myTurn || st.phase !== 'roll' || busy}
          style={[
            styles.dice,
            { borderColor: myColor ? COLOR_HEX[myColor] : '#999' },
            (!myTurn || st.phase !== 'roll') && styles.diceDim,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Roll dice"
        >
          <Animated.View style={{ transform: [{ rotate }] }}>
            <DiceFace value={st.dice} size={54} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

function DiceFace({ value, size }: { value: number | null; size: number }) {
  const pips: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [[0.25, 0.25], [0.75, 0.75]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.25, 0.22], [0.75, 0.22], [0.25, 0.5], [0.75, 0.5], [0.25, 0.78], [0.75, 0.78]],
  };
  const dots = value ? pips[value] : [];
  return (
    <Svg width={size} height={size} viewBox="0 0 1 1">
      <Rect x={0.04} y={0.04} width={0.92} height={0.92} rx={0.18} fill="#fff" stroke="#222" strokeWidth={0.04} />
      {dots.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={0.085} fill="#111" />
      ))}
      {!value ? <Path d="M0.32 0.5h0.36" stroke="#999" strokeWidth={0.05} strokeLinecap="round" /> : null}
    </Svg>
  );
}

/** Static board: bases, cross track, coloured home columns, safe stars, centre. */
function BoardSvg({ cell, colorsInPlay }: { cell: number; colorsInPlay: Set<LudoColor> }) {
  const s = cell;
  const base = (color: LudoColor) => {
    const [x, y] = BASE_ORIGIN[color];
    const dim = !colorsInPlay.has(color);
    return (
      <G key={color} opacity={dim ? 0.35 : 1}>
        <Rect x={x * s} y={y * s} width={6 * s} height={6 * s} fill={COLOR_HEX[color]} />
        <Rect x={(x + 1) * s} y={(y + 1) * s} width={4 * s} height={4 * s} rx={s * 0.4} fill="#fafafa" />
        {BASE_SLOTS.map(([sx, sy], i) => (
          <Circle key={i} cx={(x + sx) * s} cy={(y + sy) * s} r={s * 0.42} fill="none" stroke={COLOR_HEX[color]} strokeWidth={2} />
        ))}
      </G>
    );
  };
  const trackCells = TRACK.map(([x, y], i) => {
    const startColor = (Object.keys(START) as LudoColor[]).find((c) => START[c] === i);
    const fill = startColor ? COLOR_HEX[startColor] : '#fafafa';
    return (
      <G key={`t${i}`}>
        <Rect x={x * s} y={y * s} width={s} height={s} fill={fill} stroke="#cfd3d8" strokeWidth={1} />
        {SAFE.has(i) && !startColor ? (
          <Polygon
            points={star(x * s + s / 2, y * s + s / 2, s * 0.36, s * 0.16)}
            fill="#888"
            opacity={0.55}
          />
        ) : null}
      </G>
    );
  });
  const homeCols = (Object.keys(HOME_COL) as LudoColor[]).flatMap((color) =>
    HOME_COL[color].slice(0, 5).map(([x, y], i) => (
      <Rect key={`${color}h${i}`} x={x * s} y={y * s} width={s} height={s} fill={COLOR_HEX[color]} stroke="#cfd3d8" strokeWidth={1} />
    )),
  );
  return (
    <G>
      <Rect x={0} y={0} width={15 * s} height={15 * s} fill="#eceff3" rx={s * 0.5} />
      {(['red', 'green', 'yellow', 'blue'] as LudoColor[]).map(base)}
      {trackCells}
      {homeCols}
      {/* centre: four triangles */}
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

function ludoStyles(c: ThemeColors) {
  return {
    wrap: { flex: 1, paddingHorizontal: 12, paddingTop: 6 },
    turnRow: { flexDirection: 'row' as const, gap: 6, marginBottom: 8 },
    seat: {
      flex: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 10,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    seatActive: { borderColor: c.chrome },
    seatDot: { width: 10, height: 10, borderRadius: 5 },
    seatName: { color: c.textMuted, fontSize: 12, fontWeight: '600' as const, flexShrink: 1 },
    seatNameActive: { color: c.text },
    seatHome: { color: c.textDim, fontSize: 11, marginLeft: 'auto' as any },
    controls: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      marginTop: 12,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    statusCol: { flex: 1 },
    status: { color: c.text, fontWeight: '700' as const, fontSize: 15 },
    event: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    timer: { color: c.textDim, fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] as any },
    timerLow: { color: c.danger },
    dice: {
      width: 70,
      height: 70,
      borderRadius: 16,
      borderWidth: 3,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    diceDim: { opacity: 0.5 },
  };
}

