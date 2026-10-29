import React, { useCallback, useMemo, useState } from 'react';
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
  const [events, setEvents] = useState<ScrimEvent[]>([]);
  const [resultHistory, setResultHistory] = useState<ModeHistoryEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  const mode: StatMode = eventType === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM';
  const typeLabel = eventType === 'TOURNAMENT' ? 'Tournament' : 'Scrim';

  const load = useCallback(async () => {
    const [data, history] = await Promise.all([
      scrimsApi.listScrims(),
      statsApi.getModeHistory(mode).catch(() => ({ entries: [] as ModeHistoryEntry[] })),
    ]);
    setEvents(data.filter((e) => e.type === eventType));
    setResultHistory(history.entries);
  }, [eventType, mode]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await load();
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
      await load();
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
      quality: 0.9,
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

      <View style={styles.tabRow}>
        {(
          [
            ['upcoming', 'Upcoming'],
            ['past', 'Past'],
            ['results', 'Results'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.tab, tab === value && styles.tabActive]}
            onPress={() => setTab(value)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={tab === value ? styles.tabTextActive : styles.tabText}>
              {label}
            </Text>
          </Pressable>
        ))}
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
                <Pressable
                  style={styles.primaryAction}
                  onPress={() => uploadResultForEvent(item)}
                  disabled={uploadingEventId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel="Upload Result"
                >
                  {uploadingEventId === item.id ? (
                    <ActivityIndicator color="#0a0a0c" />
                  ) : (
                    <Text style={styles.primaryActionText}>Upload Result</Text>
                  )}
                </Pressable>
                {canEdit(item) && (
                  <>
                    <Pressable
                      onPress={() =>
                        navigation.navigate('AddEditScrim', { scrim: item })
                      }
                    >
                      <Text style={styles.action}>Edit</Text>
                    </Pressable>
                    <Pressable onPress={() => onDelete(item)}>
                      <Text style={[styles.action, { color: '#dc2626' }]}>
                        Delete
                      </Text>
                    </Pressable>
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
                <Pressable
                  key={entry.id}
                  style={styles.dayRow}
                  onPress={() =>
                    navigation.navigate('PlayerStats', {
                      userId: entry.userId,
                      name: entry.name,
                      mode: entry.mode,
                    })
                  }
                >
                  <Text style={styles.dayName}>{entry.name}</Text>
                  <Text style={styles.dayStats}>
                    {entry.kills}K / {entry.assists}A
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        />
      )}

      <View style={styles.bottomBar}>
        <Pressable
          style={styles.addBtn}
          onPress={() =>
            navigation.navigate('AddEditScrim', { defaultType: eventType })
          }
          accessibilityRole="button"
          accessibilityLabel={`Add ${typeLabel}`}
        >
          <Text style={styles.addBtnText}>+ Add {typeLabel}</Text>
        </Pressable>
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
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  tabText: { color: '#f2f3f5', fontWeight: '600', fontSize: 12 },
  tabTextActive: { color: '#0a0a0c', fontWeight: '700', fontSize: 12 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  empty: { textAlign: 'center', color: '#9aa0a6', marginTop: 28 },
  card: {
    borderWidth: 1,
    borderColor: '#3a3d44',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#f2f3f5' },
  meta: { color: '#9aa0a6', fontSize: 12, marginTop: 6 },
  link: { color: '#a8b0ff', marginTop: 4 },
  notes: { color: '#9aa0a6', marginTop: 4 },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  primaryAction: {
    backgroundColor: '#c9ccd1',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    minWidth: 110,
    alignItems: 'center',
  },
  primaryActionText: { color: '#0a0a0c', fontWeight: '700', fontSize: 12 },
  action: { color: '#a8b0ff', fontWeight: '600' },
  dayCard: {
    marginTop: 10,
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
  dayStats: { color: '#9aa0a6', fontWeight: '600' },
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#2a2d33',
    backgroundColor: 'rgba(10,10,12,0.92)',
  },
  addBtn: {
    backgroundColor: '#c9ccd1',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 18,
    minWidth: 120,
    alignItems: 'center',
  },
  addBtnText: { color: '#0a0a0c', fontWeight: '700', fontSize: 13 },
});
