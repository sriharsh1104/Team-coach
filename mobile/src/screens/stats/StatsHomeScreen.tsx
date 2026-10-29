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
import { sharedStyles } from '../shared';
import { colors } from '../../theme';
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

export function StatsHomeScreen({ navigation, route }: Props) {
  const { org } = useAuth();
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

  const load = useCallback(async (selected: StatMode) => {
    if (!isGrindMode(selected)) return;
    const [board, extractions, modeHistory] = await Promise.all([
      statsApi.getLeaderboard(selected),
      statsApi.listExtractions(selected),
      statsApi.getModeHistory(selected),
    ]);
    setLeaderboard(board);
    setPending(
      extractions.filter((e) =>
        ['QUEUED', 'PROCESSING', 'PENDING', 'FAILED'].includes(e.status),
      ),
    );
    setHistory(modeHistory.entries);
    setHistoryCursor(modeHistory.nextCursor);
  }, []);

  useEffect(() => {
    if (route.params?.mode) setMode(route.params.mode);
  }, [route.params?.mode]);

  useFocusEffect(
    useCallback(() => {
      void load(mode);
    }, [load, mode]),
  );

  const onSelectMode = (next: StatMode) => {
    setMode(next);
    void load(next);
  };

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load(mode);
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
      quality: 0.9,
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
        });
        mediaPostIds.push(post.id);
      }
      const { created, skipped } = await statsApi.requestExtractions({
        mode,
        mediaPostIds,
      });
      await load(mode);
      const skippedNote =
        skipped.length > 0 ? ` (${skipped.length} already had an extraction)` : '';
      Alert.alert(
        'Scoreboards Queued',
        `${created.length} screenshot(s) queued for processing${skippedNote}. We'll show them under Pending Review once they're ready.`,
      );
    } catch (err: any) {
      Alert.alert(
        'Could Not Queue Extraction',
        err?.response?.data?.message?.toString() ??
          'Try clearer Free Fire scoreboard screenshots.',
      );
    } finally {
      setUploading(false);
    }
  };

  const onRetry = async (id: string) => {
    try {
      await statsApi.retryExtraction(id);
      await load(mode);
    } catch (err: any) {
      Alert.alert('Could not retry', err?.response?.data?.message?.toString() ?? '');
    }
  };

  const onDiscard = async (id: string) => {
    try {
      await statsApi.rejectExtraction(id);
      await load(mode);
    } catch (err: any) {
      Alert.alert('Could not discard', err?.response?.data?.message?.toString() ?? '');
    }
  };

  const modeLabel = STAT_MODES.find((m) => m.mode === mode)?.label ?? mode;
  const dayGroups = useMemo(() => groupEntriesByDay(history), [history]);

  const modeChips = (
    <View style={styles.modeRow}>
      {STAT_MODES.map((item) => {
        const active = mode === item.mode;
        return (
          <Pressable
            key={item.mode}
            onPress={() => onSelectMode(item.mode)}
            style={[styles.modeChip, active && styles.modeChipActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <Text style={active ? styles.modeTextActive : styles.modeText}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!grind) {
    return (
      <Screen>
        <View style={styles.root}>
          <View style={styles.header}>
            <Text style={sharedStyles.title}>Stats</Text>
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
      <Text style={sharedStyles.title}>Stats</Text>
      <Text style={styles.hint}>
        {modeLabel} grind — upload one or more scoreboards. Only matched
        teammates update. Scrims / Tournament are separate tabs.
      </Text>
      {modeChips}

      <View style={styles.viewTabs}>
        {(
          [
            ['board', 'Leaderboard'],
            ['days', 'By Day'],
          ] as const
        ).map(([value, label]) => {
          const active = viewTab === value;
          return (
            <Pressable
              key={value}
              onPress={() => setViewTab(value)}
              style={[styles.viewTab, active && styles.viewTabActive]}
              accessibilityRole="button"
              accessibilityLabel={label}
            >
              <Text style={active ? styles.viewTabTextActive : styles.viewTabText}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {pending.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Pending Review</Text>
          {pending.map((extraction) => (
            <View key={extraction.id} style={styles.pendingRow}>
              <Pressable
                style={{ flex: 1 }}
                disabled={extraction.status !== 'PENDING' || !isReviewer}
                onPress={() =>
                  navigation.navigate('ExtractionReview', { extraction })
                }
              >
                <Text style={{ color: '#f2f3f5' }}>
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
                    style={[styles.reviewLink, { color: '#f87171' }]}
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

      <Text style={styles.sectionHeader}>
        {viewTab === 'board' ? `${modeLabel} Leaderboard` : `${modeLabel} By Day`}
      </Text>
    </>
  );

  return (
    <Screen>
      <View style={styles.root}>
        {viewTab === 'board' ? (
          <FlatList
            style={styles.list}
            data={leaderboard}
            keyExtractor={(item) => item.userId}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
            ListEmptyComponent={
              <Text style={styles.empty}>
                No {modeLabel} grind stats yet. Upload scoreboard(s) below.
              </Text>
            }
            renderItem={({ item, index }) => (
              <Pressable
                style={styles.row}
                onPress={() =>
                  navigation.navigate('PlayerStats', {
                    userId: item.userId,
                    name: item.name,
                    mode,
                  })
                }
              >
                <Text style={styles.rank}>#{index + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{item.name}</Text>
                  <Text style={styles.meta}>{item.matches} match(es)</Text>
                </View>
                <Text style={styles.stats}>
                  {item.kills}K / {item.assists}A / {item.damage} DMG
                </Text>
              </Pressable>
            )}
          />
        ) : (
          <FlatList
            style={styles.list}
            data={dayGroups}
            keyExtractor={(item) => item.dayKey}
            ListHeaderComponent={listHeader}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
            }
            onEndReached={onLoadMoreHistory}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isLoadingMoreHistory ? (
                <ActivityIndicator color="#c9ccd1" style={{ marginVertical: 12 }} />
              ) : null
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No {modeLabel} day history yet.</Text>
            }
            renderItem={({ item: group }) => (
              <View style={styles.dayCard}>
                <View style={styles.dayHeader}>
                  <Text style={styles.dayTitle}>{group.label}</Text>
                  <Text style={styles.dayTotals}>
                    {group.kills}K / {group.assists}A / {group.damage} DMG
                  </Text>
                </View>
                {group.entries.map((entry) => (
                  <Pressable
                    key={entry.id}
                    style={styles.dayRow}
                    onPress={() =>
                      navigation.navigate('PlayerStats', {
                        userId: entry.userId,
                        name: entry.name,
                        mode,
                      })
                    }
                  >
                    <Text style={styles.dayName}>{entry.name}</Text>
                    <Text style={styles.stats}>
                      {entry.kills}K / {entry.assists}A / {entry.damage} DMG
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          />
        )}

        <View style={styles.bottomBar}>
          <Pressable
            style={[styles.uploadBtn, uploading && styles.uploadDisabled]}
            onPress={onUploadScoreboards}
            disabled={uploading}
            accessibilityRole="button"
            accessibilityLabel="Upload Scoreboard"
          >
            {uploading ? (
              <ActivityIndicator color="#0a0a0c" />
            ) : (
              <Text style={styles.uploadText}>Upload {modeLabel}</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 18,
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  modeChipActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  modeText: { color: '#f2f3f5', fontWeight: '600' },
  modeTextActive: { color: '#0a0a0c', fontWeight: '700' },
  viewTabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  viewTab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3a3d44',
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  viewTabActive: {
    backgroundColor: 'rgba(201,204,209,0.18)',
    borderColor: '#c9ccd1',
  },
  viewTabText: { color: '#9aa0a6', fontWeight: '600', fontSize: 13 },
  viewTabTextActive: { color: '#f2f3f5', fontWeight: '700', fontSize: 13 },
  sectionHeader: {
    fontWeight: '700',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 8,
    color: '#e8eaed',
  },
  pendingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  reviewLink: { color: '#a8b0ff', fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  rank: { width: 32, fontWeight: '700', color: '#9aa0a6' },
  name: { fontWeight: '600', color: '#f2f3f5' },
  meta: { color: '#9aa0a6', fontSize: 12, marginTop: 2 },
  stats: { color: '#9aa0a6', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#9aa0a6', marginTop: 28 },
  dayCard: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#3a3d44',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  dayTitle: { color: '#f2f3f5', fontWeight: '700' },
  dayTotals: { color: '#c9ccd1', fontWeight: '600', fontSize: 12 },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  dayName: { color: '#e8eaed' },
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2d33',
    backgroundColor: 'rgba(10,10,12,0.92)',
  },
  uploadBtn: {
    backgroundColor: '#c9ccd1',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 120,
    alignItems: 'center',
  },
  uploadDisabled: { opacity: 0.6 },
  uploadText: { color: '#0a0a0c', fontWeight: '700', fontSize: 13 },
});
