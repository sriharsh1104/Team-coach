import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Linking,
  Alert,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as mediaApi from '../../api/media';
import * as scrimsApi from '../../api/scrims';
import * as statsApi from '../../api/stats';
import { confirmAsync } from '../../ui/confirmAsync';
import { useAuth } from '../../auth/AuthContext';
import {
  ModeHistoryEntry,
  ScrimEvent,
  ScrimEventType,
  StatMode,
} from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { SoftPressable } from '../../ui/SoftPressable';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import { colors } from '../../theme';
import {
  cacheGet,
  cacheSet,
  CacheKeys,
  cacheInvalidate,
} from '../../api/queryCache';
import { useOrgRealtimeOptional } from '../../realtime/OrgRealtimeProvider';
import { groupEntriesByDay } from '../stats/dayGroups';

type Tab = 'upcoming' | 'past' | 'results';

function lastRelevantDate(event: ScrimEvent): number {
  const last = event.rounds[event.rounds.length - 1];
  return new Date(last ? last.scheduledAt : event.scheduledAt).getTime();
}

function isHistorical(event: ScrimEvent): boolean {
  const last = event.rounds[event.rounds.length - 1];
  if (last?.result === 'ELIMINATED') return true;
  return lastRelevantDate(event) < Date.now();
}

/** Schedule + per-match result upload for Scrims or Tournament (inside Stats). */
export function MatchSchedulePanel({
  eventType,
}: {
  eventType: ScrimEventType;
}) {
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user, org } = useAuth();
  const realtime = useOrgRealtimeOptional();
  const [events, setEvents] = useState<ScrimEvent[]>([]);
  const [resultHistory, setResultHistory] = useState<ModeHistoryEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  const mode: StatMode = eventType === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM';
  const typeLabel = eventType === 'TOURNAMENT' ? 'Tournament' : 'Scrim';

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const key = `${CacheKeys.scrimsList()}:${eventType}`;
      if (!opts?.force) {
        const cached = cacheGet<{
          events: ScrimEvent[];
          history: ModeHistoryEntry[];
        }>(key);
        if (cached) {
          setEvents(cached.events);
          setResultHistory(cached.history);
          return;
        }
      }
      const [data, history] = await Promise.all([
        scrimsApi.listScrims(),
        statsApi
          .getModeHistory(mode)
          .catch(() => ({ entries: [] as ModeHistoryEntry[] })),
      ]);
      const filtered = data.filter((e) => e.type === eventType);
      cacheSet(key, { events: filtered, history: history.entries });
      setEvents(filtered);
      setResultHistory(history.entries);
    },
    [eventType, mode],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    if (!realtime) return;
    return realtime.subscribe((event) => {
      if (
        event.type !== 'scrims.changed' &&
        event.type !== 'stats.changed'
      ) {
        return;
      }
      void load({ force: true });
    });
  }, [realtime, load]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    cacheInvalidate(`${CacheKeys.scrimsList()}:${eventType}`);
    await load({ force: true });
    setIsRefreshing(false);
  };

  const onDelete = async (event: ScrimEvent) => {
    const confirmed = await confirmAsync(
      'Delete entry',
      `Remove "${event.title}"?`,
      'Delete',
    );
    if (!confirmed) return;
    try {
      await scrimsApi.deleteScrim(event.id);
      await load({ force: true });
    } catch (err: any) {
      Alert.alert(
        'Could not delete',
        err?.response?.data?.message?.toString() ?? 'Please try again.',
      );
    }
  };

  const canEdit = (event: ScrimEvent) =>
    event.createdById === user?.id ||
    org?.role === 'COACH' ||
    org?.isOwner === true;

  const uploadResultForEvent = async (event: ScrimEvent) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Needed', 'Allow gallery access to upload a result.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;

    const asset = picked.assets[0];
    setUploadingEventId(event.id);
    try {
      const post = await mediaApi.uploadMedia({
        uri: asset.uri,
        fileName: asset.fileName ?? `result-${event.id}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        caption: `${event.type} result: ${event.title}`,
        width: asset.width,
        height: asset.height,
      });
      const { created } = await statsApi.requestExtractions({
        mode,
        mediaPostIds: [post.id],
        scrimEventId: event.id,
      });
      // Still QUEUED at this point — OCR hasn't run yet. ExtractionReviewScreen
      // shows a "still processing" state and polls until it's ready.
      navigation.navigate('ExtractionReview', { extraction: created[0] });
    } catch (err: any) {
      Alert.alert(
        'Could Not Extract Stats',
        err?.response?.data?.message?.toString() ??
          'Try a clearer Free Fire scoreboard screenshot.',
      );
    } finally {
      setUploadingEventId(null);
    }
  };

  const upcoming = events
    .filter((e) => !isHistorical(e))
    .sort((a, b) => lastRelevantDate(a) - lastRelevantDate(b));
  const past = events
    .filter(isHistorical)
    .sort((a, b) => lastRelevantDate(b) - lastRelevantDate(a));
  const resultDays = useMemo(
    () => groupEntriesByDay(resultHistory),
    [resultHistory],
  );

  const listData = tab === 'upcoming' ? upcoming : past;

  return (
    <View style={styles.root}>
      <Text style={styles.hint}>
        Add {typeLabel.toLowerCase()} date/time, then upload that match&apos;s
        scoreboard to update each player&apos;s {typeLabel.toLowerCase()} stats.
      </Text>

      <View style={styles.tabPad}>
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={
            [
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
              { value: 'results', label: 'Results' },
            ] as const
          }
        />
      </View>

      {tab !== 'results' ? (
        <FlatList
          style={styles.list}
          data={listData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'upcoming'
                ? `No upcoming ${typeLabel.toLowerCase()}s. Add one below.`
                : `No past ${typeLabel.toLowerCase()}s yet.`}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.meta}>
                {new Date(item.scheduledAt).toLocaleString()} · by{' '}
                {item.createdByName}
                {item.rounds?.length
                  ? ` · ${item.rounds.length} Round(s)`
                  : ''}
              </Text>
              {item.platform ? (
                <Pressable onPress={() => Linking.openURL(item.platform!)}>
                  <Text style={styles.link}>{item.platform}</Text>
                </Pressable>
              ) : null}
              {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}

              <View style={styles.actionsRow}>
                <SoftPressable
                  style={styles.primaryAction}
                  onPress={() => uploadResultForEvent(item)}
                  disabled={uploadingEventId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel="Upload Result"
                  pressScale={0.97}
                >
                  {uploadingEventId === item.id ? (
                    <ActivityIndicator color="#0a0a0c" />
                  ) : (
                    <Text style={styles.primaryActionText}>Upload Result</Text>
                  )}
                </SoftPressable>
                {canEdit(item) && (
                  <>
                    <SoftPressable
                      onPress={() =>
                        navigation.navigate('AddEditScrim', { scrim: item })
                      }
                      pressScale={0.96}
                    >
                      <Text style={styles.action}>Edit</Text>
                    </SoftPressable>
                    <SoftPressable onPress={() => onDelete(item)} pressScale={0.96}>
                      <Text style={[styles.action, { color: colors.danger }]}>
                        Delete
                      </Text>
                    </SoftPressable>
                  </>
                )}
              </View>
            </View>
          )}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={resultDays}
          keyExtractor={(item: { dayKey: string }) => item.dayKey}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No {typeLabel.toLowerCase()} results yet. Upload from a match
              above.
            </Text>
          }
          renderItem={({ item: group }: { item: any }) => (
            <View style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{group.label}</Text>
                <Text style={styles.dayTotals}>
                  {group.kills}K / {group.assists}A
                </Text>
              </View>
              {group.entries.map((entry: ModeHistoryEntry) => (
                <SoftPressable
                  key={entry.id}
                  style={styles.dayRow}
                  onPress={() =>
                    navigation.navigate('PlayerStats', {
                      userId: entry.userId,
                      name: entry.name,
                      mode: entry.mode,
                    })
                  }
                  pressScale={0.985}
                >
                  <Text style={styles.dayName}>{entry.name}</Text>
                  <Text style={styles.dayStats}>
                    {entry.kills}K / {entry.assists}A
                  </Text>
                </SoftPressable>
              ))}
            </View>
          )}
        />
      )}

      <View style={styles.bottomBar}>
        <SoftPressable
          style={styles.addBtn}
          onPress={() =>
            navigation.navigate('AddEditScrim', { defaultType: eventType })
          }
          accessibilityRole="button"
          accessibilityLabel={`Add ${typeLabel}`}
          pressScale={0.97}
        >
          <Text style={styles.addBtnText}>+ Add {typeLabel}</Text>
        </SoftPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hint: {
    color: '#9aa0a6',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  tabPad: { paddingHorizontal: 16 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  empty: { textAlign: 'center', color: colors.textMuted, marginTop: 28 },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 6 },
  link: { color: colors.link, marginTop: 4 },
  notes: { color: colors.textMuted, marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  primaryAction: {
    backgroundColor: colors.chrome,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 110,
    alignItems: 'center',
  },
  primaryActionText: {
    color: colors.chromeInk,
    fontWeight: '700',
    fontSize: 12,
  },
  action: { color: colors.link, fontWeight: '600' },
  dayCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dayTitle: { color: colors.text, fontWeight: '700' },
  dayTotals: { color: colors.chrome, fontWeight: '600', fontSize: 12 },
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  dayName: { color: '#e8eaed' },
  dayStats: { color: colors.textMuted, fontWeight: '600' },
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2d33',
    backgroundColor: 'rgba(10,10,12,0.94)',
  },
  addBtn: {
    backgroundColor: colors.chrome,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 140,
    alignItems: 'center',
  },
  addBtnText: { color: colors.chromeInk, fontWeight: '700', fontSize: 14 },
});
