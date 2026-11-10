import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as mediaApi from '../../api/media';
import * as statsApi from '../../api/stats';
import {
  LeaderboardRow,
  ModeHistoryEntry,
  StatExtraction,
  StatMode,
  STAT_MODES,
} from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { useSharedStyles } from '../shared';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import {
  cacheGet,
  cacheSet,
  CacheKeys,
  cacheInvalidate,
} from '../../api/queryCache';
import { useOrgRealtimeOptional } from '../../realtime/OrgRealtimeProvider';
import { groupEntriesByDay } from './dayGroups';
import { MatchSchedulePanel } from '../scrims/MatchSchedulePanel';
import { useAuth } from '../../auth/AuthContext';

type Props = NativeStackScreenProps<MainStackParamList, 'Stats'>;
type ViewTab = 'board' | 'days';

function isGrindMode(mode: StatMode) {
  return mode === 'BR' || mode === 'CS';
}

// Review is coach/owner-only (StatsService.requireReviewAccess) — a plain
// player tapping "Review" on their own upload would just hit a 403, so they
// get an informational label instead of an action.
function pendingLabel(status: StatExtraction['status'], isReviewer: boolean): string {
  if (status === 'QUEUED' || status === 'PROCESSING') return 'Processing…';
  if (status === 'PENDING' && !isReviewer) return 'Pending review from coach';
  return 'Review →';
}

type ModeBundle = {
  board: LeaderboardRow[];
  pending: StatExtraction[];
  history: ModeHistoryEntry[];
  historyCursor: string | null;
};

function applyBundle(
  bundle: ModeBundle,
  setters: {
    setLeaderboard: (v: LeaderboardRow[]) => void;
    setPending: (v: StatExtraction[]) => void;
    setHistory: (v: ModeHistoryEntry[]) => void;
    setHistoryCursor: (v: string | null) => void;
  },
) {
  setters.setLeaderboard(bundle.board);
  setters.setPending(bundle.pending);
  setters.setHistory(bundle.history);
  setters.setHistoryCursor(bundle.historyCursor);
}

export function StatsHomeScreen({ navigation, route }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(statsStyles);
  const { org } = useAuth();
  const realtime = useOrgRealtimeOptional();
  const isReviewer = org?.role === 'COACH' || org?.isOwner === true;
  const [mode, setMode] = useState<StatMode>(route.params?.mode ?? 'BR');
  const [viewTab, setViewTab] = useState<ViewTab>('board');
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [history, setHistory] = useState<ModeHistoryEntry[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [isLoadingMoreHistory, setIsLoadingMoreHistory] = useState(false);
  const [pending, setPending] = useState<StatExtraction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const grind = isGrindMode(mode);

  const load = useCallback(
    async (selected: StatMode, opts?: { force?: boolean }) => {
      if (!isGrindMode(selected)) return;
      const cacheKey = `stats:bundle:${selected}`;
      if (!opts?.force) {
        const cached = cacheGet<ModeBundle>(cacheKey);
        if (cached) {
          applyBundle(cached, {
            setLeaderboard,
            setPending,
            setHistory,
            setHistoryCursor,
          });
          return;
        }
      }

      const [board, extractions, modeHistory] = await Promise.all([
        statsApi.getLeaderboard(selected),
        statsApi.listExtractions(selected),
        statsApi.getModeHistory(selected),
      ]);
      const bundle: ModeBundle = {
        board,
        pending: extractions.filter((e) =>
          ['QUEUED', 'PROCESSING', 'PENDING', 'FAILED'].includes(e.status),
        ),
        history: modeHistory.entries,
        historyCursor: modeHistory.nextCursor,
      };
      cacheSet(cacheKey, bundle);
      cacheSet(CacheKeys.statsBoard(selected), board);
      applyBundle(bundle, {
        setLeaderboard,
        setPending,
        setHistory,
        setHistoryCursor,
      });
    },
    [],
  );

  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
  }, [route.params?.mode]);

  // Cache-first on focus / mode — network only when cold or forced.
  useFocusEffect(
    useCallback(() => {
      void load(mode);
    }, [load, mode]),
  );

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (event.type !== 'stats.changed' && event.type !== 'scrims.changed') {
        return;
      }
      void load(mode, { force: true });
    });
  }, [realtime, load, mode]);

  const onSelectMode = (next: StatMode) => {
    setMode(next);
    void load(next);
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    cacheInvalidate(`stats:bundle:${mode}`);
    await load(mode, { force: true });
    setIsRefreshing(false);
  };

  const onLoadMoreHistory = async () => {
    if (!historyCursor || isLoadingMoreHistory) return;
    setIsLoadingMoreHistory(true);
    try {
      const next = await statsApi.getModeHistory(mode, { cursor: historyCursor });
      setHistory((prev) => [...prev, ...next.entries]);
      setHistoryCursor(next.nextCursor);
    } finally {
      setIsLoadingMoreHistory(false);
    }
  };

  /** BR / CS — multiple scoreboard screenshots in one pick, one batch request. */
  const onUploadScoreboards = async () => {
    if (!grind) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Needed', 'Allow gallery access to upload scoreboards.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });
    if (result.canceled || !result.assets.length) return;

    setUploading(true);
    try {
      const mediaPostIds: string[] = [];
      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        const post = await mediaApi.uploadMedia({
          uri: asset.uri,
          fileName: asset.fileName ?? `scoreboard-${mode}-${Date.now()}-${i}.jpg`,
          mimeType: asset.mimeType ?? 'image/jpeg',
          caption: `${mode} grind scoreboard`,
          width: asset.width,
          height: asset.height,
        });
        mediaPostIds.push(post.id);
      }
      const { created, skipped } = await statsApi.requestExtractions({
        mode,
        mediaPostIds,
      });
      await load(mode, { force: true });
      const skippedNote =
        skipped.length > 0 ? ` (${skipped.length} already had an extraction)` : '';
      Alert.alert(
        'Scoreboards Queued',
        `${created.length} screenshot(s) queued for processing${skippedNote}. We'll show them under Pending Review once they're ready.`,
      );
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    } finally {
      setUploading(false);
    }
  };

  const onRetry = async (id: string) => {
    try {
      await statsApi.retryExtraction(id);
      await load(mode, { force: true });
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  const onDiscard = async (id: string) => {
    try {
      await statsApi.rejectExtraction(id);
      await load(mode, { force: true });
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  const modeLabel = STAT_MODES.find((m) => m.mode === mode)?.label ?? mode;
  const dayGroups = useMemo(() => groupEntriesByDay(history), [history]);

  const modeChips = (
    <View style={staticStyles.modeTrack}>
      {STAT_MODES.map((item) => {
        const active = mode === item.mode;
        return (
          <SoftPressable
            key={item.mode}
            onPress={() => onSelectMode(item.mode)}
            style={[staticStyles.modeChip, active && styles.modeChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            pressScale={0.96}
          >
            <Text style={active ? styles.modeTextActive : styles.modeText}>
              {item.label}
            </Text>
          </SoftPressable>
        );
      })}
    </View>
  );

  if (!grind) {
    return (
      <Screen>
        <View style={staticStyles.root}>
          <View style={staticStyles.header}>
            <Text style={shared.title}>Stats</Text>
            <Text style={styles.hint}>
              {mode === 'SCRIM'
                ? 'Scrims — schedule match date/time, then upload that match result. BR/CS grind is a separate tab.'
                : 'Tournament — schedule rounds, then upload each result. BR/CS grind is a separate tab.'}
            </Text>
            {modeChips}
          </View>
          <MatchSchedulePanel
            key={mode}
            eventType={mode === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM'}
          />
        </View>
      </Screen>
    );
  }

  const listHeader = (
    <>
      <Text style={shared.title}>Stats</Text>
      <Text style={styles.hint}>
        {modeLabel} grind — upload one or more scoreboards. Only matched
        teammates update. Scrims / Tournament are separate tabs.
      </Text>
      {modeChips}

      <SegmentedTabs
        value={viewTab}
        onChange={setViewTab}
        tabs={
          [
            { value: 'board', label: 'Leaderboard' },
            { value: 'days', label: 'By Day' },
          ] as const
        }
      />

      {pending.length > 0 && (
        <>
          <Text style={staticStyles.sectionHeader}>Pending Review</Text>
          {pending.map((extraction) => (
            <View key={extraction.id} style={styles.pendingRow}>
              <Pressable
                style={{ flex: 1 }}
                disabled={extraction.status !== 'PENDING' || !isReviewer}
                onPress={() =>
                  navigation.navigate('ExtractionReview', { extraction })
                }
              >
                <Text style={{ color: colors.text }}>
                  {extraction.status === 'FAILED'
                    ? "Couldn't read this screenshot"
                    : `${extraction.rows.length} player(s)`}{' '}
                  · {new Date(extraction.createdAt).toLocaleString()}
                </Text>
              </Pressable>
              {extraction.status === 'FAILED' ? (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Text
                    style={styles.reviewLink}
                    onPress={() => onRetry(extraction.id)}
                  >
                    Retry
                  </Text>
                  <Text
                    style={[styles.reviewLink, { color: colors.danger }]}
                    onPress={() => onDiscard(extraction.id)}
                  >
                    Discard
                  </Text>
                </View>
              ) : (
                <Text style={styles.reviewLink}>
                  {pendingLabel(extraction.status, isReviewer)}
                </Text>
              )}
            </View>
          ))}
        </>
      )}

      <Text style={staticStyles.sectionHeader}>
        {viewTab === 'board' ? `${modeLabel} Leaderboard` : `${modeLabel} By Day`}
      </Text>
    </>
  );

  return (
    <Screen>
      <View style={staticStyles.root}>
        {viewTab === 'board' ? (
          <FlatList
            style={staticStyles.list}
            data={leaderboard}
            keyExtractor={(item) => item.userId}
            ListHeaderComponent={listHeader}
            contentContainerStyle={staticStyles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                No {modeLabel} grind stats yet. Upload scoreboard(s) below.
              </Text>
            }
            renderItem={({ item, index }) => (
              <SoftPressable
                style={[staticStyles.row, index === 0 && staticStyles.rowLead]}
                onPress={() =>
                  navigation.navigate('PlayerStats', {
                    userId: item.userId,
                    name: item.name,
                    mode,
                  })
                }
                pressScale={0.985}
              >
                <Text style={[styles.rank, index === 0 && styles.rankLead]}>
                  #{index + 1}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.matches} match(es)</Text>
                </View>
                <Text style={styles.stats}>
                  {item.kills}K / {item.assists}A / {item.damage} DMG
                </Text>
              </SoftPressable>
            )}
          />
        ) : (
          <FlatList
            style={staticStyles.list}
            data={dayGroups}
            keyExtractor={(item) => item.dayKey}
            ListHeaderComponent={listHeader}
            contentContainerStyle={staticStyles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
            onEndReached={onLoadMoreHistory}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMoreHistory ? (
                <ActivityIndicator color={colors.chrome} style={{ marginVertical: 12 }} />
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No {modeLabel} day history yet.</Text>
            }
            renderItem={({ item: group }) => (
              <View style={staticStyles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayTitle}>{group.label}</Text>
                  <Text style={styles.dayTotals}>
                    {group.kills}K / {group.assists}A / {group.damage} DMG
                  </Text>
                </View>
                {group.entries.map((entry) => (
                  <SoftPressable
                    key={entry.id}
                    style={staticStyles.dayRow}
                    onPress={() =>
                      navigation.navigate('PlayerStats', {
                        userId: entry.userId,
                        name: entry.name,
                        mode,
                      })
                    }
                    pressScale={0.985}
                  >
                    <Text style={staticStyles.dayName}>{entry.name}</Text>
                    <Text style={styles.stats}>
                      {entry.kills}K / {entry.assists}A / {entry.damage} DMG
                    </Text>
                  </SoftPressable>
                ))}
              </View>
            )}
          />
        )}

        <View style={staticStyles.bottomBar}>
          <SoftPressable
            style={[styles.uploadBtn, uploading && staticStyles.uploadDisabled]}
            onPress={onUploadScoreboards}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Upload Scoreboard"
            pressScale={0.97}
          >
            {uploading ? (
              <ActivityIndicator color={colors.chromeInk} />
            ) : (
              <Text style={styles.uploadText}>Upload {modeLabel}</Text>
            )}
          </SoftPressable>
        </View>
      </View>
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  modeTrack: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
    padding: 4,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  modeChip: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  sectionHeader: {
    fontWeight: '700',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 8,
    color: '#e8eaed',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 10,
    marginBottom: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rowLead: {
    backgroundColor: 'rgba(201,204,209,0.1)',
    borderColor: 'rgba(201,204,209,0.28)',
  },
  dayCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  dayName: { color: '#e8eaed' },
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2d33',
    backgroundColor: 'rgba(10,10,12,0.94)',
  },
  uploadDisabled: { opacity: 0.6 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function statsStyles(c: ThemeColors) {
  return {
    hint: {
      color: c.textMuted,
      fontSize: 13,
      marginTop: 4,
      marginBottom: 12,
      lineHeight: 18,
    },
    modeChipActive: { backgroundColor: c.chrome },
    modeText: { color: c.textMuted, fontWeight: '600' as const },
    modeTextActive: { color: c.chromeInk, fontWeight: '700' as const },
    pendingRow: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      alignItems: 'center' as const,
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    reviewLink: { color: c.link, fontWeight: '600' as const },
    rank: { width: 36, fontWeight: '700' as const, color: c.textMuted },
    rankLead: { color: c.chrome },
    name: { fontWeight: '600' as const, color: c.text },
    meta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    stats: { color: c.textMuted, fontWeight: '600' as const },
    empty: { textAlign: 'center' as const, color: c.textMuted, marginTop: 28 },
    dayHeader: {
      flexDirection: 'row' as const,
      justifyContent: 'space-between' as const,
      marginBottom: 8,
      paddingBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    dayTitle: { color: c.text, fontWeight: '700' as const },
    dayTotals: { color: c.chrome, fontWeight: '600' as const, fontSize: 12 },
    uploadBtn: {
      backgroundColor: c.chrome,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 28,
      minWidth: 160,
      alignItems: 'center' as const,
    },
    uploadText: { color: c.chromeInk, fontWeight: '700' as const, fontSize: 14 },
  };
}
