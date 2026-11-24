import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  BOOTS_COLS,
  BOOTS_ROWS,
  BootsOrientation,
  BootsPublicState,
  BootsShotResult,
  RoomView,
} from '../../api/games';
import { ThemeColors } from '../../theme';
import { useThemedStyles } from '../../theme/useThemedStyles';

/**
 * Cell size, sized to the screen instead of a fixed 40px.
 *
 * The grid is 6 columns plus one label column, inside the room's 16px
 * padding — at a hardcoded 40 that came to 280px and left a third of a modern
 * phone empty beside it. Deriving it fills the width properly (≈52px on a
 * 430px phone) while the clamp keeps it sane on a very small or very wide
 * screen.
 */
const BOARD_COLUMNS = BOOTS_COLS.length + 1;
const SCREEN_PADDING = 32;
const CELL = Math.round(
  Math.min(
    64,
    Math.max(
      40,
      (Dimensions.get('window').width - SCREEN_PADDING) / BOARD_COLUMNS,
    ),
  ),
);

type Props = {
  room: RoomView;
  meId: string;
  busy: boolean;
  onPlace: (col: number, row: number, orientation: BootsOrientation) => void;
  onPlaceRandom: () => void;
  onClear: () => void;
  onReady: () => void;
  /** `targetId` picks which opponent's board to hit — required once there is
   * more than one live opponent, optional (auto-resolved) with just one. */
  onFire: (col: number, row: number, targetId?: string) => void;
};

function shotFill(result: BootsShotResult | undefined): string {
  if (result === 'sunk') return '#b91c1c';
  if (result === 'hit') return '#ea580c';
  if (result === 'miss') return 'rgba(125, 211, 252, 0.22)';
  return 'transparent';
}

type BootShape = {
  id: string;
  length: number;
  cells: { col: number; row: number }[];
  sunk: boolean;
};

type AssembleFx = {
  kind: 'build' | 'find';
  bootId: string;
  length: number;
  /** Cells still popping in order. */
  queue: string;
};

/**
 * When a boot is placed (build) or sunk (find), reveal its cells one-by-one
 * with a pop — like watching the boot assemble / get discovered.
 */
function useBootAssemble(boots: BootShape[], kind: 'build' | 'find') {
  const seenRef = useRef<Set<string>>(new Set());
  const primedRef = useRef(false);
  const queueRef = useRef<BootShape[]>([]);
  const runningRef = useRef(false);
  const [fx, setFx] = useState<AssembleFx | null>(null);
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const animsRef = useRef<Map<string, Animated.Value>>(new Map());

  const getAnim = (key: string) => {
    let v = animsRef.current.get(key);
    if (!v) {
      v = new Animated.Value(1);
      animsRef.current.set(key, v);
    }
    return v;
  };

  useEffect(() => {
    const ids = new Set(boots.map((b) => b.id));
    // Cleared / replaced fleet — drop removed ids so a re-place can animate.
    for (const id of [...seenRef.current]) {
      if (!ids.has(id)) seenRef.current.delete(id);
    }
    // Drop cells that no longer belong to any boot (Clear).
    const liveKeys = new Set<string>();
    for (const b of boots) for (const c of b.cells) liveKeys.add(`${c.col},${c.row}`);
    setVisible((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const k of prev) {
        if (liveKeys.has(k)) next.add(k);
        else changed = true;
      }
      return changed ? next : prev;
    });

    if (!primedRef.current) {
      primedRef.current = true;
      for (const b of boots) seenRef.current.add(b.id);
      setVisible(liveKeys);
      return;
    }

    const newcomers = boots.filter((b) => !seenRef.current.has(b.id));
    if (newcomers.length === 0) return;

    for (const b of newcomers) seenRef.current.add(b.id);
    queueRef.current.push(...newcomers);
    if (runningRef.current) return;

    const runNext = () => {
      const next = queueRef.current.shift();
      if (!next) {
        runningRef.current = false;
        setFx(null);
        return;
      }
      runningRef.current = true;
      const keys = next.cells.map((c) => `${c.col},${c.row}`);
      setFx({
        kind,
        bootId: next.id,
        length: next.length,
        queue: `${keys.length}`,
      });
      let i = 0;
      const step = () => {
        if (i >= keys.length) {
          setTimeout(runNext, 160);
          return;
        }
        const key = keys[i++];
        const anim = getAnim(key);
        anim.setValue(0.12);
        setVisible((prev) => {
          const n = new Set(prev);
          n.add(key);
          return n;
        });
        Animated.spring(anim, {
          toValue: 1,
          friction: 5,
          tension: 150,
          useNativeDriver: true,
        }).start(() => setTimeout(step, 65));
      };
      step();
    };

    runNext();
  }, [boots, kind]);

  return { fx, visible, getAnim };
}

function TurnBanner({
  mode,
  myName,
  enemyName,
  turnName,
  winnerName,
  styles,
}: {
  mode: 'you' | 'them' | 'win' | 'lose' | 'placing' | 'waiting';
  myName: string;
  /** The opponent whose board is currently shown below — may differ from
   * whose turn it actually is once there are 2+ opponents. */
  enemyName: string;
  /** Whoever's turn it is right now — same as enemyName in a 2-player match. */
  turnName: string;
  /** Who actually won — distinct from enemyName in a 3-4 player match. */
  winnerName?: string;
  styles: ReturnType<typeof boardStyles>;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (mode !== 'you') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.035,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [mode, pulse]);

  const copy =
    mode === 'you'
      ? { eyebrow: 'Fire now', title: 'YOUR TURN', sub: `Tap ${enemyName}'s board` }
      : mode === 'them'
        ? { eyebrow: 'Hold fire', title: `${turnName.toUpperCase()}'S TURN`, sub: 'Wait for their shot' }
        : mode === 'win'
          ? { eyebrow: 'Victory', title: 'YOU WIN', sub: 'Last fleet afloat' }
          : mode === 'lose'
            ? {
                eyebrow: 'Defeat',
                title: `${(winnerName ?? enemyName).toUpperCase()} WINS`,
                sub: 'Your fleet is gone',
              }
            : mode === 'waiting'
              ? { eyebrow: 'Locked in', title: 'WAITING', sub: `${enemyName} is still placing` }
              : {
                  eyebrow: 'Deploy',
                  title: 'PLACE BOOTS',
                  sub: `${myName} — set your fleet`,
                };

  const tone =
    mode === 'you'
      ? styles.turnYou
      : mode === 'them'
        ? styles.turnThem
        : mode === 'win'
          ? styles.turnWin
          : mode === 'lose'
            ? styles.turnLose
            : styles.turnIdle;

  return (
    <Animated.View
      style={[styles.turnBanner, tone, mode === 'you' ? { transform: [{ scale: pulse }] } : null]}
      accessibilityRole="summary"
      accessibilityLabel={`${copy.title}. ${copy.sub}`}
    >
      <Text style={styles.turnEyebrow}>{copy.eyebrow}</Text>
      <Text style={styles.turnTitle}>{copy.title}</Text>
      <Text style={styles.turnSub}>{copy.sub}</Text>
    </Animated.View>
  );
}

function Grid({
  title,
  badge,
  own,
  boots,
  shots,
  interactive,
  highlighted,
  dimmed,
  onPressCell,
  showBoots,
  assembleKind,
}: {
  title: string;
  badge?: string;
  own?: boolean;
  boots: BootShape[];
  shots: Record<string, BootsShotResult>;
  interactive: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onPressCell?: (col: number, row: number) => void;
  showBoots: boolean;
  /** Animate new boots cell-by-cell (place = build, sink = find). */
  assembleKind?: 'build' | 'find';
}) {
  const styles = useThemedStyles(boardStyles);
  const { fx, visible, getAnim } = useBootAssemble(
    showBoots ? boots : [],
    assembleKind ?? 'build',
  );

  const bootAt = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!showBoots) return map;
    for (const b of boots) {
      for (const c of b.cells) map.set(`${c.col},${c.row}`, b.sunk);
    }
    return map;
  }, [boots, showBoots]);

  return (
    <View
      style={[
        styles.boardBlock,
        highlighted && styles.boardHot,
        dimmed && styles.boardDim,
      ]}
    >
      <View style={styles.boardHead}>
        <Text style={styles.boardTitle}>{title}</Text>
        {badge ? (
          <View style={[styles.boardBadge, highlighted && styles.boardBadgeHot]}>
            <Text style={styles.boardBadgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>

      {fx ? (
        <View
          style={[
            styles.assembleBanner,
            fx.kind === 'find' ? styles.assembleFind : styles.assembleBuild,
          ]}
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.assembleBannerText}>
            {fx.kind === 'find'
              ? `FOUND · size ${fx.length}`
              : `BUILDING · size ${fx.length}`}
          </Text>
        </View>
      ) : null}

      <View style={[styles.ocean, highlighted && styles.oceanHot]}>
        <View style={styles.gridWrap}>
          <View style={styles.corner} />
          {BOOTS_COLS.map((c) => (
            <Text key={c} style={styles.colLabel}>
              {c}
            </Text>
          ))}
          {BOOTS_ROWS.map((rowNum, row) => (
            <React.Fragment key={rowNum}>
              <Text style={styles.rowLabel}>{rowNum}</Text>
              {BOOTS_COLS.map((_, col) => {
                const key = `${col},${row}`;
                const shot = shots[key];
                const hasBoot = bootAt.has(key) && visible.has(key);
                const sunkBoot = hasBoot && bootAt.get(key);
                const assembling = hasBoot && fx != null;
                const anim = getAnim(key);
                return (
                  <Pressable
                    key={key}
                    disabled={!interactive}
                    onPress={() => onPressCell?.(col, row)}
                    style={styles.cellHitbox}
                    accessibilityRole="button"
                    accessibilityLabel={`${BOOTS_COLS[col]}${rowNum}${
                      shot ? `, ${shot}` : hasBoot ? ', your boot' : ''
                    }`}
                  >
                    <Animated.View
                      style={[
                        styles.cell,
                        interactive && styles.cellLive,
                        hasBoot && !shot && styles.cellBoot,
                        hasBoot && styles.cellBoot3d,
                        sunkBoot && styles.cellSunkBoot,
                        assembling && fx?.kind === 'find' && styles.cellFinding,
                        shot ? { backgroundColor: shotFill(shot) } : null,
                        hasBoot
                          ? {
                              transform: [
                                { scale: anim },
                                {
                                  translateY: anim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [10, 0],
                                  }),
                                },
                              ],
                              opacity: anim,
                            }
                          : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.cellMark,
                          shot === 'miss' && styles.cellMiss,
                          (shot === 'hit' || shot === 'sunk') && styles.cellHit,
                        ]}
                      >
                        {shot === 'miss'
                          ? '○'
                          : shot === 'hit'
                            ? '✕'
                            : shot === 'sunk'
                              ? '◆'
                              : ''}
                      </Text>
                    </Animated.View>
                  </Pressable>
                );
              })}
            </React.Fragment>
          ))}
        </View>
      </View>
      {own ? (
        <Text style={styles.hint}>
          Boots pop in as you place · ○ miss · ✕ hit · ◆ sunk
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Boots — place fleet on a 6×6 board, then take turns firing.
 * Turn state is the loudest signal: pulsing banner + glowing active board.
 */
export function BootsBoard({
  room,
  meId,
  busy,
  onPlace,
  onPlaceRandom,
  onClear,
  onReady,
  onFire,
}: Props) {
  const styles = useThemedStyles(boardStyles);
  const boots = room.boots as BootsPublicState;
  const [orientation, setOrientation] = useState<BootsOrientation>('horizontal');
  // Which opponent's board is shown below — only matters once there are 2+
  // of them; with exactly one this never needs to change.
  const [selectedEnemyId, setSelectedEnemyId] = useState<string | null>(null);

  const me = room.players.find((p) => p.userId === meId);
  const myName = me?.name?.trim() || 'You';
  const nameOf = (id: string | null | undefined) =>
    (id && room.players.find((p) => p.userId === id)?.name?.trim()) || 'Opponent';

  const enemies = boots.enemies;
  const multiEnemy = enemies.length > 1;
  // Prefer whoever is still manually selected; otherwise default to the
  // first opponent still in the match rather than one already eliminated.
  const activeEnemy = useMemo(() => {
    if (selectedEnemyId) {
      const found = enemies.find((e) => e.id === selectedEnemyId);
      if (found) return found;
    }
    return enemies.find((e) => !e.eliminated) ?? enemies[0] ?? null;
  }, [selectedEnemyId, enemies]);
  const enemyName = nameOf(activeEnemy?.id);
  const turnName = boots.turnId === meId ? myName : nameOf(boots.turnId);
  const winnerName = nameOf(boots.winnerId);

  const placed = boots.own.boots.length;
  const fleetTotal = boots.fleet.length;

  const remaining = (() => {
    const used = boots.own.boots.map((b) => b.length).sort((a, b) => b - a);
    const need = [...boots.fleet].sort((a, b) => b - a);
    const left: number[] = [];
    for (const n of need) {
      const i = used.indexOf(n);
      if (i >= 0) used.splice(i, 1);
      else left.push(n);
    }
    return left;
  })();

  const myReady = !!boots.ready[meId];
  const myTurn = boots.turnId === meId;

  const last = boots.lastShot;
  const lastText = last
    ? `${last.by === meId ? 'You' : nameOf(last.by)}${
        multiEnemy && last.target
          ? ` → ${last.target === meId ? 'you' : nameOf(last.target)}`
          : ''
      } · ${String.fromCharCode(65 + last.cell.col)}${
        last.cell.row + 1
      }  ${last.result.toUpperCase()}${
        last.bootLength ? ` · sank ${last.bootLength}` : ''
      }`
    : null;

  if (boots.phase === 'placing') {
    return (
      <View style={styles.root}>
        <TurnBanner
          mode={myReady ? 'waiting' : 'placing'}
          myName={myName}
          enemyName={enemyName}
          turnName={turnName}
          styles={styles}
        />

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillLabel}>Fleet</Text>
            <Text style={styles.metaPillValue}>{boots.fleet.join(' · ')}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillLabel}>Placed</Text>
            <Text style={styles.metaPillValue}>
              {placed}/{fleetTotal}
            </Text>
          </View>
          {enemies.map((e) => (
            <View
              key={e.id}
              style={[styles.metaPill, e.ready && styles.metaPillReady]}
            >
              <Text style={styles.metaPillLabel} numberOfLines={1}>
                {nameOf(e.id)}
              </Text>
              <Text style={styles.metaPillValue}>
                {e.ready ? 'Ready' : 'Placing…'}
              </Text>
            </View>
          ))}
        </View>

        {!myReady ? (
          <View style={styles.toolbar}>
            <Pressable
              style={[styles.chip, orientation === 'horizontal' && styles.chipOn]}
              onPress={() => setOrientation('horizontal')}
              accessibilityRole="button"
              accessibilityLabel="Horizontal"
            >
              <Text style={styles.chipText}>↔ Horizontal</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, orientation === 'vertical' && styles.chipOn]}
              onPress={() => setOrientation('vertical')}
              accessibilityRole="button"
              accessibilityLabel="Vertical"
            >
              <Text style={styles.chipText}>↕ Vertical</Text>
            </Pressable>
            <Pressable
              style={styles.chip}
              disabled={busy}
              onPress={onPlaceRandom}
              accessibilityRole="button"
              accessibilityLabel="Place randomly"
            >
              <Text style={styles.chipText}>Random</Text>
            </Pressable>
            <Pressable
              style={styles.chip}
              disabled={busy || placed === 0}
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel="Clear boots"
            >
              <Text style={styles.chipText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}

        {remaining[0] && !myReady ? (
          <Text style={styles.nextSize}>
            Next boot · size <Text style={styles.nextSizeStrong}>{remaining[0]}</Text>
          </Text>
        ) : null}

        <Grid
          title="Your waters"
          badge={myReady ? 'Locked' : 'Deploy'}
          own
          boots={boots.own.boots}
          shots={boots.own.shots}
          showBoots
          assembleKind="build"
          highlighted={!myReady}
          interactive={!myReady && !!remaining[0] && !busy}
          onPressCell={(col, row) => onPlace(col, row, orientation)}
        />

        {!myReady && remaining.length === 0 ? (
          <Pressable
            style={styles.primary}
            disabled={busy}
            onPress={onReady}
            accessibilityRole="button"
            accessibilityLabel="Ready"
          >
            <Text style={styles.primaryText}>Ready — lock fleet</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const turnMode =
    boots.phase === 'done'
      ? boots.winnerId === meId
        ? 'win'
        : 'lose'
      : myTurn
        ? 'you'
        : 'them';

  const activeEliminated = !!activeEnemy?.eliminated;

  return (
    <View style={styles.root}>
      <TurnBanner
        mode={turnMode}
        myName={myName}
        enemyName={enemyName}
        turnName={turnName}
        winnerName={winnerName}
        styles={styles}
      />

      <View style={styles.metaRow}>
        <View style={styles.metaPill}>
          <Text style={styles.metaPillLabel}>Your fleet</Text>
          <Text style={styles.metaPillValue}>
            {boots.own.sunkCount}/{fleetTotal} sunk
          </Text>
        </View>
      </View>

      {lastText ? (
        <View style={styles.lastShot}>
          <Text style={styles.lastShotLabel}>Last shot</Text>
          <Text style={styles.lastShotText}>{lastText}</Text>
        </View>
      ) : null}

      {multiEnemy ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.enemyTabs}
        >
          {enemies.map((e) => {
            const name = nameOf(e.id);
            const isActive = activeEnemy?.id === e.id;
            return (
              <Pressable
                key={e.id}
                style={[
                  styles.enemyTab,
                  isActive && styles.enemyTabActive,
                  e.eliminated && styles.enemyTabOut,
                ]}
                onPress={() => setSelectedEnemyId(e.id)}
                accessibilityRole="button"
                accessibilityLabel={`${name}${
                  e.eliminated ? ', eliminated' : ''
                }, ${e.sunkCount}/${e.fleetSize} sunk${
                  boots.turnId === e.id ? ', their turn' : ''
                }`}
              >
                {boots.turnId === e.id ? (
                  <View style={styles.enemyTabTurnDot} />
                ) : null}
                <Text style={styles.enemyTabName} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={styles.enemyTabSub}>
                  {e.eliminated ? 'OUT' : `${e.sunkCount}/${e.fleetSize} sunk`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Grid
        title={`${enemyName}'s waters`}
        badge={
          activeEliminated
            ? 'Eliminated'
            : myTurn && boots.phase === 'battle'
              ? 'Fire here'
              : 'Enemy'
        }
        boots={activeEnemy?.sunkBoots ?? []}
        shots={activeEnemy?.shots ?? {}}
        showBoots
        assembleKind="find"
        highlighted={boots.phase === 'battle' && myTurn && !activeEliminated}
        dimmed={boots.phase === 'battle' && (!myTurn || activeEliminated)}
        interactive={
          boots.phase === 'battle' && myTurn && !busy && !!activeEnemy && !activeEliminated
        }
        onPressCell={(col, row) => activeEnemy && onFire(col, row, activeEnemy.id)}
      />

      <Grid
        title="Your waters"
        badge="Defense"
        own
        boots={boots.own.boots}
        shots={boots.own.shots}
        showBoots
        assembleKind="build"
        dimmed={boots.phase === 'battle' && myTurn}
        interactive={false}
      />
    </View>
  );
}

function boardStyles(c: ThemeColors) {
  return {
    root: { paddingHorizontal: 16, paddingBottom: 28, gap: 12 },

    turnBanner: {
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderWidth: 2,
      alignItems: 'center' as const,
      gap: 2,
    },
    turnYou: {
      backgroundColor: 'rgba(34, 197, 94, 0.18)',
      borderColor: '#22c55e',
    },
    turnThem: {
      backgroundColor: 'rgba(251, 146, 60, 0.16)',
      borderColor: '#fb923c',
    },
    turnWin: {
      backgroundColor: 'rgba(250, 204, 21, 0.18)',
      borderColor: '#facc15',
    },
    turnLose: {
      backgroundColor: 'rgba(248, 113, 113, 0.16)',
      borderColor: '#f87171',
    },
    turnIdle: {
      backgroundColor: 'rgba(56, 189, 248, 0.12)',
      borderColor: 'rgba(56, 189, 248, 0.55)',
    },
    turnEyebrow: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
    },
    turnTitle: {
      color: c.text,
      fontSize: 22,
      fontWeight: '900' as const,
      letterSpacing: 1,
    },
    turnSub: {
      color: c.textMuted,
      fontSize: 13,
      marginTop: 2,
      textAlign: 'center' as const,
    },

    metaRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    metaPill: {
      flexGrow: 1,
      minWidth: 96,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: 'rgba(14, 116, 144, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.22)',
    },
    metaPillReady: {
      backgroundColor: 'rgba(34, 197, 94, 0.16)',
      borderColor: 'rgba(34, 197, 94, 0.45)',
    },
    metaPillLabel: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    metaPillValue: {
      color: c.text,
      fontSize: 14,
      fontWeight: '800' as const,
      marginTop: 2,
    },

    lastShot: {
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      borderWidth: 1,
      borderColor: 'rgba(148, 163, 184, 0.25)',
    },
    lastShotLabel: {
      color: c.textMuted,
      fontSize: 10,
      fontWeight: '700' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
    },
    lastShotText: {
      color: c.text,
      fontSize: 13,
      fontWeight: '700' as const,
      marginTop: 2,
    },

    enemyTabs: { gap: 8, paddingVertical: 2 },
    enemyTab: {
      minWidth: 92,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: 'rgba(14, 116, 144, 0.22)',
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.22)',
      alignItems: 'center' as const,
    },
    enemyTabActive: {
      borderColor: '#22c55e',
      borderWidth: 2,
      backgroundColor: 'rgba(34, 197, 94, 0.16)',
    },
    enemyTabOut: { opacity: 0.45 },
    enemyTabName: { color: c.text, fontSize: 12, fontWeight: '800' as const },
    enemyTabSub: { color: c.textMuted, fontSize: 10, marginTop: 2 },
    enemyTabTurnDot: {
      position: 'absolute' as const,
      top: 6,
      right: 6,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#fbbf24',
    },

    nextSize: { color: c.textMuted, fontSize: 13 },
    nextSizeStrong: { color: c.chrome, fontWeight: '900' as const, fontSize: 15 },

    hint: { color: c.textMuted, fontSize: 11, marginTop: 6 },
    toolbar: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: 'rgba(125, 211, 252, 0.28)',
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: 'rgba(14, 116, 144, 0.18)',
    },
    chipOn: {
      borderColor: '#38bdf8',
      backgroundColor: 'rgba(56, 189, 248, 0.22)',
    },
    chipText: { color: c.text, fontSize: 12, fontWeight: '700' as const },
    primary: {
      backgroundColor: '#0ea5e9',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center' as const,
      marginTop: 4,
      shadowColor: '#0ea5e9',
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    primaryText: { color: '#04131c', fontWeight: '900' as const, fontSize: 15 },

    boardBlock: { marginTop: 4, opacity: 1 },
    boardHot: {},
    boardDim: { opacity: 0.55 },
    boardHead: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 8,
      gap: 8,
    },
    boardTitle: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800' as const,
      letterSpacing: 0.4,
    },
    boardBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: 'rgba(148, 163, 184, 0.2)',
    },
    boardBadgeHot: { backgroundColor: 'rgba(34, 197, 94, 0.28)' },
    boardBadgeText: {
      color: c.text,
      fontSize: 11,
      fontWeight: '800' as const,
    },

    ocean: {
      alignSelf: 'flex-start' as const,
      borderRadius: 14,
      padding: 8,
      backgroundColor: 'rgba(8, 47, 73, 0.72)',
      borderWidth: 1,
      borderColor: 'rgba(56, 189, 248, 0.22)',
    },
    oceanHot: {
      borderColor: '#22c55e',
      borderWidth: 2,
      shadowColor: '#22c55e',
      shadowOpacity: 0.45,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
      elevation: 6,
      backgroundColor: 'rgba(6, 78, 59, 0.35)',
    },
    gridWrap: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      width: CELL * BOARD_COLUMNS,
    },
    corner: { width: CELL, height: CELL },
    colLabel: {
      width: CELL,
      height: CELL,
      textAlign: 'center' as const,
      textAlignVertical: 'center' as const,
      color: 'rgba(186, 230, 253, 0.75)',
      fontSize: 11,
      fontWeight: '800' as const,
      lineHeight: CELL,
    },
    rowLabel: {
      width: CELL,
      height: CELL,
      textAlign: 'center' as const,
      color: 'rgba(186, 230, 253, 0.75)',
      fontSize: 11,
      fontWeight: '800' as const,
      lineHeight: CELL,
    },
    assembleBanner: {
      alignSelf: 'flex-start' as const,
      marginBottom: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    assembleBuild: {
      backgroundColor: 'rgba(56, 189, 248, 0.2)',
      borderColor: 'rgba(56, 189, 248, 0.55)',
    },
    assembleFind: {
      backgroundColor: 'rgba(250, 204, 21, 0.22)',
      borderColor: 'rgba(250, 204, 21, 0.7)',
    },
    assembleBannerText: {
      color: c.text,
      fontSize: 12,
      fontWeight: '900' as const,
      letterSpacing: 0.8,
    },

    cellHitbox: {
      width: CELL,
      height: CELL,
    },
    cell: {
      width: CELL,
      height: CELL,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(56, 189, 248, 0.18)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'rgba(14, 116, 144, 0.28)',
    },
    cellLive: {
      backgroundColor: 'rgba(14, 165, 233, 0.22)',
    },
    cellBoot: { backgroundColor: 'rgba(148, 163, 184, 0.62)' },
    // Fake extrusion — lighter top/left, darker bottom/right.
    cellBoot3d: {
      borderTopWidth: 2,
      borderLeftWidth: 2,
      borderBottomWidth: 2,
      borderRightWidth: 2,
      borderTopColor: 'rgba(255,255,255,0.45)',
      borderLeftColor: 'rgba(255,255,255,0.28)',
      borderBottomColor: 'rgba(15,23,42,0.55)',
      borderRightColor: 'rgba(15,23,42,0.4)',
    },
    cellSunkBoot: { backgroundColor: 'rgba(185, 28, 28, 0.72)' },
    cellFinding: {
      backgroundColor: 'rgba(250, 204, 21, 0.55)',
      borderTopColor: 'rgba(254, 243, 199, 0.9)',
      borderLeftColor: 'rgba(253, 224, 71, 0.7)',
    },
    cellMark: { fontWeight: '900' as const, fontSize: 15 },
    cellMiss: { color: 'rgba(186, 230, 253, 0.85)', fontSize: 13 },
    cellHit: { color: '#fff7ed', fontSize: 16 },
  };
}
