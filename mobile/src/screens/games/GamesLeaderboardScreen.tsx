import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Screen } from '../../brand/Screen';
import { GAME_CATALOG, GameKind } from '../../api/games';
import {
  GamePlayerStats,
  getGameLeaderboard,
  getMyGameStats,
  getPlayerGameStats,
  GameLeaderboardRow,
} from '../../api/gameStats';
import { useAuth } from '../../auth/AuthContext';
import { ChannelAvatar } from '../chat/ChannelAvatar';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SkeletonList } from '../../ui/Skeleton';
import { emitToast } from '../../ui/toastBus';

/** Short chip labels — GAME_CATALOG's own titles ("Stone Paper Scissors",
 * "Road Rash Rush") are the right length for a card, too long for a chip. */
const SHORT_LABEL: Record<GameKind, string> = {
  rps: 'RPS',
  ludo: 'Ludo',
  boots: 'Boots',
  cut: 'Cut',
  chess: 'Chess',
  uno: 'UNO',
  race: 'Race',
};

type Filter = 'all' | GameKind;

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function initials(name: string): string {
  return (name.trim()[0] ?? '?').toUpperCase();
}

/**
 * Org-wide leaderboard across the seven in-app mini-games, plus a tap-through
 * to any player's own breakdown and recent-match history. Entirely read-only
 * — everything here comes from GameMatch / GameMatchPlayer history that
 * GamesService writes as rooms finish, not from a live room.
 */
export function GamesLeaderboardScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(leaderboardStyles);
  const [filter, setFilter] = useState<Filter>('all');
  const [board, setBoard] = useState<GameLeaderboardRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mine, setMine] = useState<GamePlayerStats | null>(null);
  const [detail, setDetail] = useState<GamePlayerStats | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const loadBoard = useCallback(async (next: Filter) => {
    try {
      const rows = await getGameLeaderboard(next === 'all' ? undefined : next);
      setBoard(rows);
    } catch {
      emitToast('Could not load the leaderboard');
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      setMine(await getMyGameStats());
    } catch {
      // Quiet — the summary card just stays hidden if this fails.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void Promise.all([loadBoard(filter), loadMine()]).finally(() =>
        setLoading(false),
      );
      // Only on focus / first mount — changing the filter re-fetches on its
      // own effect below, without re-running the "your stats" card fetch.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  useEffect(() => {
    if (loading) return; // the focus effect above already covers the first load
    void loadBoard(filter);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadBoard(filter), loadMine()]);
    setRefreshing(false);
  };

  const openPlayer = async (userId: string) => {
    if (userId === user?.id && mine) {
      setDetail(mine);
      return;
    }
    setDetailLoading(userId);
    try {
      setDetail(await getPlayerGameStats(userId));
    } catch {
      emitToast('Could not load their stats');
    } finally {
      setDetailLoading(null);
    }
  };

  const filters: { value: Filter; label: string; emoji: string }[] = [
    { value: 'all', label: 'All', emoji: '🏆' },
    ...GAME_CATALOG.map((g) => ({
      value: g.id,
      label: SHORT_LABEL[g.id],
      emoji: g.emoji,
    })),
  ];

  return (
    <Screen>
      <View style={staticStyles.root}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={staticStyles.chipRow}
          style={styles.chipScroll}
        >
          {filters.map((f) => {
            const active = filter === f.value;
            return (
              <Pressable
                key={f.value}
                onPress={() => setFilter(f.value)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${f.label} leaderboard`}
              >
                <Text style={staticStyles.chipEmoji}>{f.emoji}</Text>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          contentContainerStyle={staticStyles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.chrome}
            />
          }
        >
          {mine ? (
            <Pressable
              style={styles.mineCard}
              onPress={() => user?.id && void openPlayer(user.id)}
              accessibilityRole="button"
              accessibilityLabel="Open your own stats"
            >
              <ChannelAvatar uri={mine.avatarUrl} size={44} fallback={initials(mine.name)} previewable={false} />
              <View style={staticStyles.flex}>
                <Text style={styles.mineName}>Your stats</Text>
                <Text style={styles.mineSub}>
                  {mine.totals.played} played · {mine.totals.wins} wins ·{' '}
                  {pct(mine.totals.winRate)} win rate
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ) : null}

          <Text style={styles.section}>
            {filter === 'all' ? 'Overall' : SHORT_LABEL[filter as GameKind]}
          </Text>

          {loading ? (
            <SkeletonList count={5} avatarSize={36} />
          ) : board && board.length > 0 ? (
            board.map((row) => (
              <Pressable
                key={row.userId}
                style={styles.row}
                onPress={() => void openPlayer(row.userId)}
                disabled={detailLoading === row.userId}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}'s stats`}
              >
                <Text
                  style={[
                    styles.rank,
                    row.rank === 1 && styles.rankGold,
                    row.rank === 2 && styles.rankSilver,
                    row.rank === 3 && styles.rankBronze,
                  ]}
                >
                  {row.rank}
                </Text>
                <ChannelAvatar
                  uri={row.avatarUrl}
                  size={32}
                  fallback={initials(row.name)}
                  previewable={false}
                />
                <View style={staticStyles.flex}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {row.name}
                  </Text>
                  <Text style={styles.rowSub}>
                    {row.played} played · {row.wins}W {row.losses}L
                  </Text>
                </View>
                {detailLoading === row.userId ? (
                  <ActivityIndicator size="small" color={colors.textMuted} />
                ) : (
                  <Text style={styles.rowRate}>{pct(row.winRate)}</Text>
                )}
              </Pressable>
            ))
          ) : (
            <Text style={styles.empty}>
              No games finished here yet — play one and this board fills in.
            </Text>
          )}
        </ScrollView>
      </View>

      <Modal
        visible={!!detail}
        transparent
        animationType="fade"
        onRequestClose={() => setDetail(null)}
      >
        <View style={staticStyles.backdrop}>
          <View style={styles.sheet}>
            {detail ? (
              <ScrollView contentContainerStyle={staticStyles.sheetContent}>
                <View style={styles.sheetHeader}>
                  <ChannelAvatar
                    uri={detail.avatarUrl}
                    size={44}
                    fallback={initials(detail.name)}
                    previewable={false}
                  />
                  <View style={staticStyles.flex}>
                    <Text style={styles.sheetName}>{detail.name}</Text>
                    <Text style={styles.mineSub}>
                      {detail.totals.played} played · {detail.totals.wins} wins ·{' '}
                      {pct(detail.totals.winRate)} win rate
                    </Text>
                  </View>
                </View>

                {detail.byGame.length > 0 ? (
                  <>
                    <Text style={styles.sheetSection}>By game</Text>
                    {detail.byGame.map((g) => {
                      const spec = GAME_CATALOG.find((c) => c.id === g.game.toLowerCase());
                      return (
                        <View key={g.game} style={styles.breakdownRow}>
                          <Text style={staticStyles.chipEmoji}>{spec?.emoji ?? '🎮'}</Text>
                          <Text style={styles.breakdownName}>
                            {spec?.title ?? g.game}
                          </Text>
                          <Text style={styles.breakdownStat}>
                            {g.wins}W {g.losses}L
                          </Text>
                          <Text style={styles.breakdownRate}>{pct(g.winRate)}</Text>
                        </View>
                      );
                    })}
                  </>
                ) : null}

                {detail.recent.length > 0 ? (
                  <>
                    <Text style={styles.sheetSection}>Recent matches</Text>
                    {detail.recent.map((m) => {
                      const spec = GAME_CATALOG.find((c) => c.id === m.game.toLowerCase());
                      const names = m.opponents.map((o) => o.name).join(', ');
                      return (
                        <View key={m.id} style={styles.recentRow}>
                          <Text style={staticStyles.chipEmoji}>{spec?.emoji ?? '🎮'}</Text>
                          <View style={staticStyles.flex}>
                            <Text style={styles.recentTitle} numberOfLines={1}>
                              {spec?.title ?? m.game}
                              {names ? ` vs ${names}` : ''}
                            </Text>
                            <Text style={styles.recentDate}>
                              {new Date(m.playedAt).toLocaleDateString()}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.recentResult,
                              m.draw
                                ? styles.recentDraw
                                : m.won
                                  ? styles.recentWin
                                  : styles.recentLoss,
                            ]}
                          >
                            {m.draw ? 'Draw' : m.won ? 'Won' : 'Lost'}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                ) : (
                  <Text style={styles.empty}>No matches played yet.</Text>
                )}
              </ScrollView>
            ) : null}
            <Pressable
              style={styles.closeBtn}
              onPress={() => setDetail(null)}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const staticStyles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chipEmoji: { fontSize: 16 },
  content: { padding: 16, paddingTop: 4, paddingBottom: 32, gap: 2 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetContent: { padding: 20, paddingBottom: 8, gap: 10 },
});

function leaderboardStyles(c: ThemeColors) {
  return {
    chipScroll: { borderBottomWidth: 1, borderBottomColor: c.border },
    chip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipActive: { backgroundColor: c.chrome, borderColor: c.chrome },
    chipText: { color: c.textMuted, fontSize: 13, fontWeight: '700' as const },
    chipTextActive: { color: c.chromeInk },

    mineCard: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      padding: 14,
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginBottom: 18,
    },
    mineName: { color: c.text, fontSize: 15, fontWeight: '800' as const },
    mineSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    chevron: { color: c.textDim, fontSize: 24, fontWeight: '300' as const },

    section: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    rank: {
      width: 22,
      textAlign: 'center' as const,
      color: c.textDim,
      fontSize: 13,
      fontWeight: '800' as const,
    },
    rankGold: { color: '#eab308' },
    rankSilver: { color: '#94a3b8' },
    rankBronze: { color: '#c2703d' },
    rowName: { color: c.text, fontSize: 14, fontWeight: '700' as const },
    rowSub: { color: c.textMuted, fontSize: 11, marginTop: 1 },
    rowRate: { color: c.text, fontSize: 13, fontWeight: '800' as const },
    empty: { color: c.textMuted, fontSize: 13, textAlign: 'center' as const, paddingVertical: 24 },

    sheet: {
      maxHeight: '82%' as const,
      backgroundColor: c.bg,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
    },
    sheetHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
    sheetName: { color: c.text, fontSize: 18, fontWeight: '800' as const },
    sheetSection: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      marginTop: 10,
      marginBottom: 2,
    },
    breakdownRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    breakdownName: { flex: 1, color: c.text, fontSize: 13, fontWeight: '700' as const },
    breakdownStat: { color: c.textMuted, fontSize: 12 },
    breakdownRate: { color: c.text, fontSize: 13, fontWeight: '800' as const, width: 44, textAlign: 'right' as const },
    recentRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    recentTitle: { color: c.text, fontSize: 13, fontWeight: '600' as const },
    recentDate: { color: c.textDim, fontSize: 11, marginTop: 1 },
    recentResult: { fontSize: 12, fontWeight: '800' as const },
    recentWin: { color: '#22c55e' },
    recentLoss: { color: c.danger },
    recentDraw: { color: c.textMuted },
    closeBtn: {
      margin: 16,
      paddingVertical: 13,
      borderRadius: 14,
      alignItems: 'center' as const,
      backgroundColor: c.chrome,
    },
    closeText: { color: c.chromeInk, fontSize: 14, fontWeight: '800' as const },
  };
}
