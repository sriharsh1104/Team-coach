import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../brand/Screen';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';
import {
  ELIMINATION_POINTS,
  PLACEMENT_POINTS,
  TIEBREAKERS,
} from '../data/pointsTable';

/** FFWS placement scoring — mirrors web Points Table. */
export function PointsTableScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(pointsTableStyles);
  const sidePad = Math.max(insets.left, insets.right, 16);

  return (
    <Screen>
      <FlatList
        style={staticStyles.list}
        data={PLACEMENT_POINTS}
        keyExtractor={(item) => String(item.rank)}
        contentContainerStyle={[
          staticStyles.content,
          { paddingHorizontal: sidePad },
        ]}
        ListHeaderComponent={
          <View>
            <Text style={styles.eyebrow}>Official scoring</Text>
            <Text style={styles.title}>Points Table</Text>
            <Text style={styles.sub}>
              FFWS Battle Royale — placement points + eliminations
            </Text>
            <View style={staticStyles.chip}>
              <Text style={styles.chipText}>
                +{ELIMINATION_POINTS} pt per elimination
              </Text>
            </View>
            <View style={styles.tableHead}>
              <Text style={[styles.headCell, staticStyles.colRank]}>Rank</Text>
              <Text style={[styles.headCell, staticStyles.colPlace]}>Placement</Text>
              <Text style={[styles.headCell, staticStyles.colPts]}>Points</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <View
            style={[
              staticStyles.row,
              item.rank <= 3 ? staticStyles[`top${item.rank}` as 'top1'] : null,
            ]}
          >
            <Text style={[styles.cell, staticStyles.colRank]}>{item.rank}</Text>
            <Text
              style={[styles.cellStrong, staticStyles.colPlace]}
              numberOfLines={2}
            >
              {item.label}
            </Text>
            <Text style={[styles.pts, staticStyles.colPts]}>{item.points}</Text>
          </View>
        )}
        ListFooterComponent={
          <View style={staticStyles.footer}>
            <Text style={styles.formula}>
              Match total = placement points + (eliminations ×{' '}
              {ELIMINATION_POINTS})
            </Text>
            <Text style={styles.eyebrow}>Series ties</Text>
            <Text style={styles.sectionTitle}>Tiebreakers</Text>
            {TIEBREAKERS.map((row) => (
              <View key={row.order} style={staticStyles.tieRow}>
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

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  list: { flex: 1, minWidth: 0 },
  content: { paddingTop: 20, paddingBottom: 40 },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(201,204,209,0.16)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 18,
    maxWidth: '100%',
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
  colRank: { width: 44, flexShrink: 0 },
  colPlace: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
  colPts: { width: 56, flexShrink: 0, textAlign: 'right' },
  footer: { marginTop: 28 },
  tieRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    maxWidth: '100%',
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function pointsTableStyles(c: ThemeColors) {
  return {
    eyebrow: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1.2,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    title: {
      color: c.text,
      fontSize: 26,
      fontWeight: '800' as const,
      letterSpacing: -0.4,
    },
    sub: {
      color: c.textMuted,
      fontSize: 13,
      marginTop: 6,
      marginBottom: 14,
      lineHeight: 18,
    },
    chipText: { color: c.chrome, fontWeight: '700' as const, fontSize: 12 },
    tableHead: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      marginBottom: 4,
      maxWidth: '100%' as const,
    },
    headCell: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
    },
    cell: { color: c.textMuted, fontSize: 14 },
    cellStrong: { color: c.text, fontWeight: '700' as const, fontSize: 14 },
    pts: {
      color: c.chrome,
      fontWeight: '800' as const,
      fontSize: 15,
      textAlign: 'right' as const,
    },
    formula: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 24,
      lineHeight: 18,
    },
    sectionTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '800' as const,
      marginBottom: 12,
    },
    tieNum: {
      color: c.textDim,
      fontWeight: '800' as const,
      width: 24,
      flexShrink: 0,
    },
    tieRule: {
      color: c.text,
      fontWeight: '600' as const,
      flex: 1,
      minWidth: 0,
      fontSize: 14,
    },
  };
}
