import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../brand/Screen';
import { colors } from '../theme';
import {
  ELIMINATION_POINTS,
  PLACEMENT_POINTS,
  TIEBREAKERS,
} from '../data/pointsTable';

/** FFWS placement scoring — mirrors web Points Table. */
export function PointsTableScreen() {
  const insets = useSafeAreaInsets();
  const sidePad = Math.max(insets.left, insets.right, 16);

  return (
    <Screen>
      <FlatList
        style={styles.list}
        data={PLACEMENT_POINTS}
        keyExtractor={(item) => String(item.rank)}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: sidePad },
        ]}
        ListHeaderComponent={
          <View>
            <Text style={styles.eyebrow}>Official scoring</Text>
            <Text style={styles.title}>Points Table</Text>
            <Text style={styles.sub}>
              FFWS Battle Royale — placement points + eliminations
            </Text>
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                +{ELIMINATION_POINTS} pt per elimination
              </Text>
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.headCell, styles.colRank]}>Rank</Text>
              <Text style={[styles.headCell, styles.colPlace]}>Placement</Text>
              <Text style={[styles.headCell, styles.colPts]}>Points</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              styles.row,
              item.rank <= 3 ? styles[`top${item.rank}` as 'top1'] : null,
            ]}
          >
            <Text style={[styles.cell, styles.colRank]}>{item.rank}</Text>
            <Text
              style={[styles.cellStrong, styles.colPlace]}
              numberOfLines={2}
            >
              {item.label}
            </Text>
            <Text style={[styles.pts, styles.colPts]}>{item.points}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Text style={styles.formula}>
              Match total = placement points + (eliminations ×{' '}
              {ELIMINATION_POINTS})
            </Text>
            <Text style={styles.eyebrow}>Series ties</Text>
            <Text style={styles.sectionTitle}>Tiebreakers</Text>
            {TIEBREAKERS.map((row) => (
              <View key={row.order} style={styles.tieRow}>
                <Text style={styles.tieNum}>{row.order}</Text>
                <Text style={styles.tieRule} numberOfLines={3}>
                  {row.rule}
                </Text>
              </View>
            ))}
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, minWidth: 0 },
  content: { paddingTop: 20, paddingBottom: 40 },
  eyebrow: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  sub: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    marginBottom: 14,
    lineHeight: 18,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,204,209,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
    maxWidth: '100%',
  },
  chipText: { color: colors.chrome, fontWeight: '700', fontSize: 12 },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    marginBottom: 4,
    maxWidth: '100%',
  },
  headCell: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    maxWidth: '100%',
  },
  top1: { backgroundColor: 'rgba(250,204,21,0.08)' },
  top2: { backgroundColor: 'rgba(203,213,225,0.08)' },
  top3: { backgroundColor: 'rgba(251,146,60,0.08)' },
  cell: { color: colors.textMuted, fontSize: 14 },
  cellStrong: { color: colors.text, fontWeight: '700', fontSize: 14 },
  pts: {
    color: colors.chrome,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'right',
  },
  colRank: { width: 44, flexShrink: 0 },
  colPlace: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  colPts: { width: 56, flexShrink: 0, textAlign: 'right' },
  footer: { marginTop: 28 },
  formula: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 18,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12,
  },
  tieRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    maxWidth: '100%',
  },
  tieNum: { color: colors.textDim, fontWeight: '800', width: 24, flexShrink: 0 },
  tieRule: {
    color: colors.text,
    fontWeight: '600',
    flex: 1,
    minWidth: 0,
    fontSize: 14,
  },
});
