import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as statsApi from '../../api/stats';
import { PlayerStatsResponse, STAT_MODES } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { sharedStyles } from '../shared';
import { groupEntriesByDay } from './dayGroups';

type Props = NativeStackScreenProps<MainStackParamList, 'PlayerStats'>;

export function PlayerStatsScreen({ route }: Props) {
  const { userId, name, mode } = route.params;
  const [data, setData] = useState<PlayerStatsResponse | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const modeLabel = STAT_MODES.find((m) => m.mode === mode)?.label ?? mode;
  const dayGroups = useMemo(
    () => (data ? groupEntriesByDay(data.entries) : []),
    [data],
  );

  useEffect(() => {
    statsApi.getPlayerStats(userId, mode).then(setData);
  }, [userId, mode]);

  const onLoadMore = async () => {
    if (!data?.nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const next = await statsApi.getPlayerStats(userId, mode, {
        cursor: data.nextCursor,
      });
      setData((prev) =>
        prev
          ? { ...next, entries: [...prev.entries, ...next.entries] }
          : next,
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (!data) {
    return (
      <Screen>
        <View style={sharedStyles.container}>
          <ActivityIndicator color="#c9ccd1" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={sharedStyles.container}>
        <Text style={sharedStyles.title}>{name}</Text>
        <Text style={styles.modeLabel}>{modeLabel} · Day History</Text>
        <View style={styles.totalsRow}>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{data.totals.kills}</Text>
            <Text style={styles.totalLabel}>Kills (K)</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{data.totals.assists}</Text>
            <Text style={styles.totalLabel}>Assists (A)</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{data.totals.damage}</Text>
            <Text style={styles.totalLabel}>Damage</Text>
          </View>
          <View style={styles.totalCard}>
            <Text style={styles.totalValue}>{data.matches}</Text>
            <Text style={styles.totalLabel}>Matches</Text>
          </View>
        </View>

        <FlatList
          data={dayGroups}
          keyExtractor={(item) => item.dayKey}
          onEndReached={onLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator color="#c9ccd1" style={{ marginVertical: 12 }} />
            ) : null
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              No confirmed {modeLabel} stats yet.
            </Text>
          }
          renderItem={({ item: group }) => (
            <View style={styles.dayCard}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayTitle}>{group.label}</Text>
                <Text style={styles.dayTotals}>
                  {group.kills}K / {group.assists}A / {group.damage} DMG ·{' '}
                  {group.entries.length} match(es)
                </Text>
              </View>
              {group.entries.map((entry) => (
                <View key={entry.id} style={styles.entryRow}>
                  <Text style={styles.entryTime}>
                    {new Date(entry.recordedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.entryStats}>
                    {entry.kills}K / {entry.assists}A / {entry.damage} DMG
                  </Text>
                </View>
              ))}
            </View>
          )}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  modeLabel: {
    color: '#9aa0a6',
    marginBottom: 12,
    textTransform: 'capitalize',
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  totalCard: { alignItems: 'center', flex: 1 },
  totalValue: { fontSize: 24, fontWeight: '700', color: '#f2f3f5' },
  totalLabel: { color: '#9aa0a6', fontSize: 12 },
  empty: { textAlign: 'center', color: '#9aa0a6', marginTop: 24 },
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
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  dayTitle: { color: '#f2f3f5', fontWeight: '700', flexShrink: 1 },
  dayTotals: { color: '#9aa0a6', fontSize: 11, fontWeight: '600' },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#2a2d33',
  },
  entryTime: { color: '#9aa0a6', fontSize: 12 },
  entryStats: { color: '#e8eaed', fontWeight: '600' },
});
