import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

const CELL = 36;

type Props = {
  room: RoomView;
  meId: string;
  busy: boolean;
  onPlace: (col: number, row: number, orientation: BootsOrientation) => void;
  onPlaceRandom: () => void;
  onClear: () => void;
  onReady: () => void;
  onFire: (col: number, row: number) => void;
};

function shotColor(result: BootsShotResult | undefined): string {
  if (result === 'sunk') return '#dc2626';
  if (result === 'hit') return '#f59e0b';
  if (result === 'miss') return 'rgba(255,255,255,0.12)';
  return 'transparent';
}

function Grid({
  title,
  own,
  boots,
  shots,
  interactive,
  onPressCell,
  showBoots,
}: {
  title: string;
  own?: boolean;
  boots: { cells: { col: number; row: number }[]; sunk: boolean }[];
  shots: Record<string, BootsShotResult>;
  interactive: boolean;
  onPressCell?: (col: number, row: number) => void;
  showBoots: boolean;
}) {
  const styles = useThemedStyles(boardStyles);
  const bootAt = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!showBoots) return map;
    for (const b of boots) {
      for (const c of b.cells) map.set(`${c.col},${c.row}`, b.sunk);
    }
    return map;
  }, [boots, showBoots]);

  return (
    <View style={styles.boardBlock}>
      <Text style={styles.boardTitle}>{title}</Text>
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
              const hasBoot = bootAt.has(key);
              return (
                <Pressable
                  key={key}
                  disabled={!interactive}
                  onPress={() => onPressCell?.(col, row)}
                  style={[
                    styles.cell,
                    hasBoot && styles.cellBoot,
                    bootAt.get(key) && styles.cellSunkBoot,
                    shot ? { backgroundColor: shotColor(shot) } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${BOOTS_COLS[col]}${rowNum}${
                    shot ? `, ${shot}` : hasBoot ? ', your boot' : ''
                  }`}
                >
                  <Text style={styles.cellMark}>
                    {shot === 'miss' ? '·' : shot === 'hit' || shot === 'sunk' ? '×' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </React.Fragment>
        ))}
      </View>
      {own ? <Text style={styles.hint}>Your boots (grey)</Text> : null}
    </View>
  );
}

/**
 * Boots — place fleet on a 6×6 board, then take turns firing.
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
  const enemyId = boots.playerIds.find((id) => id !== meId) ?? boots.playerIds[1];
  const enemyReady = !!boots.ready[enemyId];
  const myTurn = boots.turnId === meId;

  const last = boots.lastShot;
  const lastText = last
    ? `${last.by === meId ? 'You' : 'They'} fired ${String.fromCharCode(65 + last.cell.col)}${
        last.cell.row + 1
      } → ${last.result}${last.bootLength ? ` (sank ${last.bootLength})` : ''}`
    : null;

  if (boots.phase === 'placing') {
    return (
      <View style={styles.root}>
        <Text style={styles.status}>
          Place boots · {placed}/{fleetTotal}
          {remaining[0] ? ` · next size ${remaining[0]}` : ' · all placed'}
        </Text>
        <Text style={styles.sub}>
          Fleet: {boots.fleet.join(' · ')} ·{' '}
          {enemyReady ? 'Opponent ready' : 'Waiting on opponent'}
        </Text>

        {!myReady ? (
          <View style={styles.toolbar}>
            <Pressable
              style={[styles.chip, orientation === 'horizontal' && styles.chipOn]}
              onPress={() => setOrientation('horizontal')}
              accessibilityRole="button"
              accessibilityLabel="Horizontal"
            >
              <Text style={styles.chipText}>Horizontal</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, orientation === 'vertical' && styles.chipOn]}
              onPress={() => setOrientation('vertical')}
              accessibilityRole="button"
              accessibilityLabel="Vertical"
            >
              <Text style={styles.chipText}>Vertical</Text>
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
        ) : (
          <Text style={styles.sub}>Locked in — waiting for the other player…</Text>
        )}

        <Grid
          title="Your board"
          own
          boots={boots.own.boots}
          shots={boots.own.shots}
          showBoots
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
            <Text style={styles.primaryText}>Ready</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Text style={styles.status}>
        {boots.phase === 'done'
          ? boots.winnerId === meId
            ? 'You found every boot — you win!'
            : 'Opponent found your fleet'
          : myTurn
            ? 'Your turn — tap their board'
            : 'Their turn'}
      </Text>
      <Text style={styles.sub}>
        Sunk {boots.sunkCounts[meId] ?? 0}/{fleetTotal}
        {lastText ? ` · ${lastText}` : ''}
      </Text>

      <Grid
        title="Enemy waters"
        boots={boots.enemy.sunkBoots}
        shots={boots.enemy.shots}
        showBoots
        interactive={boots.phase === 'battle' && myTurn && !busy}
        onPressCell={(col, row) => onFire(col, row)}
      />

      <Grid
        title="Your board"
        own
        boots={boots.own.boots}
        shots={boots.own.shots}
        showBoots
        interactive={false}
      />
    </View>
  );
}

function boardStyles(c: ThemeColors) {
  return {
    root: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
    status: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700' as const,
      marginTop: 4,
    },
    sub: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
    hint: { color: c.textMuted, fontSize: 11, marginTop: 4 },
    toolbar: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      backgroundColor: c.surface,
    },
    chipOn: { borderColor: c.chrome, backgroundColor: 'rgba(232,197,71,0.15)' },
    chipText: { color: c.text, fontSize: 12, fontWeight: '700' as const },
    primary: {
      backgroundColor: '#23a559',
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center' as const,
      marginTop: 8,
    },
    primaryText: { color: '#fff', fontWeight: '800' as const, fontSize: 15 },
    boardBlock: { marginTop: 8 },
    boardTitle: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '700' as const,
      letterSpacing: 0.6,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    gridWrap: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      width: CELL * 7,
    },
    corner: { width: CELL, height: CELL },
    colLabel: {
      width: CELL,
      height: CELL,
      textAlign: 'center' as const,
      textAlignVertical: 'center' as const,
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      lineHeight: CELL,
    },
    rowLabel: {
      width: CELL,
      height: CELL,
      textAlign: 'center' as const,
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700' as const,
      lineHeight: CELL,
    },
    cell: {
      width: CELL,
      height: CELL,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    cellBoot: { backgroundColor: 'rgba(148,163,184,0.35)' },
    cellSunkBoot: { backgroundColor: 'rgba(220,38,38,0.45)' },
    cellMark: { color: '#fff', fontWeight: '800' as const, fontSize: 14 },
  };
}
