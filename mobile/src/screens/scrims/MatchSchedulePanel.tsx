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
  Modal,
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  StatExtraction,
  StatMode,
} from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { SoftPressable } from '../../ui/SoftPressable';
import { SegmentedTabs } from '../../ui/SegmentedTabs';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { resolveMediaUrl } from '../../api/client';
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
  const { colors } = useTheme();
  const styles = useThemedStyles(matchScheduleStyles);
  const insets = useSafeAreaInsets();
  const { user, org } = useAuth();
  const realtime = useOrgRealtimeOptional();
  const [events, setEvents] = useState<ScrimEvent[]>([]);
  const [resultHistory, setResultHistory] = useState<ModeHistoryEntry[]>([]);
  const [extractions, setExtractions] = useState<StatExtraction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [uploadingEventId, setUploadingEventId] = useState<string | null>(null);
  const [scheduleTab, setScheduleTab] = useState<Tab>('upcoming');
  const [viewingUrl, setViewingUrl] = useState<string | null>(null);

  const mode: StatMode = eventType === 'TOURNAMENT' ? 'TOURNAMENT' : 'SCRIM';
  const typeLabel = eventType === 'TOURNAMENT' ? 'Tournament' : 'Scrim';

  const resultByEventId = useMemo(() => {
    const map = new Map<string, StatExtraction>();
    for (const ex of extractions) {
      if (!ex.scrimEventId || !ex.mediaUrl) continue;
      if (ex.status !== 'CONFIRMED' && ex.status !== 'PENDING') continue;
      const prev = map.get(ex.scrimEventId);
      if (!prev || new Date(ex.createdAt) > new Date(prev.createdAt)) {
        map.set(ex.scrimEventId, ex);
      }
    }
    return map;
  }, [extractions]);

  const load = useCallback(
    async (opts?: { force?: boolean }) => {
      const key = `${CacheKeys.scrimsList()}:${eventType}`;
      if (!opts?.force) {
        const cached = cacheGet<{
          events: ScrimEvent[];
          history: ModeHistoryEntry[];
          extractions: StatExtraction[];
        }>(key);
        if (cached) {
          setEvents(cached.events);
          setResultHistory(cached.history);
          setExtractions(cached.extractions ?? []);
          return;
        }
      }
      const [data, history, extractionList] = await Promise.all([
        scrimsApi.listScrims(),
        statsApi
          .getModeHistory(mode)
          .catch(() => ({ entries: [] as ModeHistoryEntry[] })),
        statsApi.listExtractions(mode).catch(() => [] as StatExtraction[]),
      ]);
      const filtered = data.filter((e) => e.type === eventType);
      cacheSet(key, {
        events: filtered,
        history: history.entries,
        extractions: extractionList,
      });
      setEvents(filtered);
      setResultHistory(history.entries);
      setExtractions(extractionList);
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
    } catch {
      /* toasted by interceptor */
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
      await load({ force: true });
      navigation.navigate('ExtractionReview', {
        extraction: created[0],
        scrimEvent: event,
      });
    } catch {
      /* toasted by interceptor */
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

  const renderMatchCard = (item: ScrimEvent) => {
    const linked = resultByEventId.get(item.id);
    const viewUrl = linked?.mediaUrl
      ? resolveMediaUrl(linked.mediaUrl)
      : null;
    return (
      <View style={staticStyles.card}>
        <Text style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.meta}>
          {new Date(item.scheduledAt).toLocaleString()} · by{' '}
          {item.createdByName}
          {item.rounds?.length ? ` · ${item.rounds.length} Round(s)` : ''}
        </Text>
        {item.platform ? (
          <Pressable onPress={() => Linking.openURL(item.platform!)}>
            <Text style={styles.link}>{item.platform}</Text>
          </Pressable>
        ) : null}
        {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}

        <View style={staticStyles.actionsRow}>
          <SoftPressable
            style={styles.primaryAction}
            onPress={() => uploadResultForEvent(item)}
            disabled={uploadingEventId === item.id}
            accessibilityRole="button"
            accessibilityLabel="Upload Result"
            pressScale={0.97}
          >
            {uploadingEventId === item.id ? (
              <ActivityIndicator color={colors.chromeInk} />
            ) : (
              <Text style={styles.primaryActionText}>Upload Result</Text>
            )}
          </SoftPressable>
          {viewUrl ? (
            <SoftPressable
              style={styles.viewAction}
              onPress={() => setViewingUrl(viewUrl)}
              accessibilityLabel="View uploaded result"
              pressScale={0.96}
            >
              <Ionicons name="eye-outline" size={18} color={colors.chromeInk} />
              <Text style={styles.viewActionText}>View</Text>
            </SoftPressable>
          ) : null}
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
        {uploadingEventId === item.id ? (
          <Text style={styles.uploadHint}>Uploading scoreboard…</Text>
        ) : linked ? (
          <Text style={styles.uploadHint}>
            Result image saved
            {linked.status === 'PENDING' ? ' · review pending' : ''}
          </Text>
        ) : null}
      </View>
    );
  };

  return (
    <View style={staticStyles.root}>
      <Text style={styles.hint}>
        Add {typeLabel.toLowerCase()} date/time, then upload that match&apos;s
        scoreboard to update each player&apos;s {typeLabel.toLowerCase()} stats.
      </Text>

      <View style={staticStyles.tabPad}>
        <SegmentedTabs
          value={scheduleTab}
          onChange={setScheduleTab}
          tabs={
            [
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
              { value: 'results', label: 'Results' },
            ] as const
          }
        />
      </View>

      {scheduleTab !== 'results' ? (
        <FlatList
          style={staticStyles.list}
          data={scheduleTab === 'upcoming' ? upcoming : past}
          keyExtractor={(item) => item.id}
          contentContainerStyle={staticStyles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {scheduleTab === 'upcoming'
                ? `No upcoming ${typeLabel.toLowerCase()}s. Add one below.`
                : `No past ${typeLabel.toLowerCase()}s yet.`}
            </Text>
          }
          renderItem={({ item }) => renderMatchCard(item)}
        />
      ) : (
        <FlatList
          style={staticStyles.list}
          data={resultDays}
          keyExtractor={(item: { dayKey: string }) => item.dayKey}
          contentContainerStyle={staticStyles.listContent}
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
            <View style={staticStyles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{group.label}</Text>
                <Text style={styles.dayTotals}>
                  {group.kills}K / {group.assists}A
                </Text>
              </View>
              {group.entries.map((entry: ModeHistoryEntry) => (
                <SoftPressable
                  key={entry.id}
                  style={staticStyles.dayRow}
                  onPress={() =>
                    navigation.navigate('PlayerStats', {
                      userId: entry.userId,
                      name: entry.name,
                      mode: entry.mode,
                    })
                  }
                  pressScale={0.985}
                >
                  <Text style={staticStyles.dayName}>{entry.name}</Text>
                  <Text style={styles.dayStats}>
                    {entry.kills}K / {entry.assists}A
                  </Text>
                </SoftPressable>
              ))}
            </View>
          )}
        />
      )}

      <View style={staticStyles.bottomBar}>
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

      <Modal
        visible={!!viewingUrl}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setViewingUrl(null)}
      >
        <View style={staticStyles.viewerRoot}>
          <View style={[styles.viewerBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <Text style={styles.viewerTitle}>Uploaded Result</Text>
            <Pressable
              style={styles.viewerClose}
              onPress={() => setViewingUrl(null)}
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={colors.chromeInk} />
            </Pressable>
          </View>
          {viewingUrl ? (
            <Image
              source={{ uri: viewingUrl }}
              style={staticStyles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  root: { flex: 1 },
  tabPad: { paddingHorizontal: 16 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingBottom: 12 },
  card: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  dayCard: {
    marginTop: 10,
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
  },
  dayName: { color: '#e8eaed' },
  bottomBar: {
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2d33',
    backgroundColor: 'rgba(10,10,12,0.94)',
  },
  viewerRoot: { flex: 1, backgroundColor: '#050507' },
  viewerImage: { flex: 1, width: '100%' },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function matchScheduleStyles(c: ThemeColors) {
  return {
    hint: {
      color: c.textMuted,
      fontSize: 13,
      marginBottom: 12,
      lineHeight: 18,
      paddingHorizontal: 16,
    },
    empty: { textAlign: 'center' as const, color: c.textMuted, marginTop: 28 },
    cardTitle: { fontSize: 16, fontWeight: '600' as const, color: c.text },
    meta: { color: c.textMuted, fontSize: 12, marginTop: 6 },
    link: { color: c.link, marginTop: 4 },
    notes: { color: c.textMuted, marginTop: 4 },
    primaryAction: {
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 14,
      minWidth: 110,
      alignItems: 'center' as const,
    },
    primaryActionText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 12,
    },
    viewAction: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      backgroundColor: c.chrome,
      borderRadius: 12,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    viewActionText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 12,
    },
    uploadHint: {
      marginTop: 8,
      color: c.textMuted,
      fontSize: 12,
    },
    action: { color: c.link, fontWeight: '600' as const },
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
    dayStats: { color: c.textMuted, fontWeight: '600' as const },
    addBtn: {
      backgroundColor: c.chrome,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 24,
      minWidth: 140,
      alignItems: 'center' as const,
    },
    addBtnText: { color: c.chromeInk, fontWeight: '700' as const, fontSize: 14 },
    viewerBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      paddingHorizontal: 14,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    viewerTitle: {
      flex: 1,
      color: c.text,
      fontWeight: '800' as const,
      fontSize: 17,
    },
    viewerClose: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.chrome,
    },
  };
}
