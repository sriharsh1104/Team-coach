import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as statsApi from '../../api/stats';
import { LeaderboardRow, StatExtraction } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'Stats'>;

export function StatsHomeScreen({ navigation }: Props) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [pending, setPending] = useState<StatExtraction[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [board, extractions] = await Promise.all([
      statsApi.getLeaderboard(),
      statsApi.listExtractions(),
    ]);
    setLeaderboard(board);
    setPending(extractions.filter((e) => e.status === 'PENDING'));
  }, []);

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

  return (
    <Screen>
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Stats</Text>

      {pending.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Pending Review</Text>
          {pending.map((extraction) => (
            <Pressable
              key={extraction.id}
              style={styles.pendingRow}
              onPress={() => navigation.navigate('ExtractionReview', { extraction })}
            >
              <Text style={{ color: '#f2f3f5' }}>
                {extraction.rows.length} player(s) · {new Date(extraction.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.reviewLink}>Review →</Text>
            </Pressable>
          ))}
        </>
      )}

      <Text style={styles.sectionHeader}>Leaderboard</Text>
      <FlatList
        data={leaderboard}
        keyExtractor={(item) => item.userId}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#9aa0a6', marginTop: 24 }}>
            No confirmed stats yet. Upload a scoreboard screenshot in Media and tap "Extract Stats".
          </Text>
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.row}
            onPress={() => navigation.navigate('PlayerStats', { userId: item.userId, name: item.name })}
          >
            <Text style={styles.rank}>#{index + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: '600', color: '#f2f3f5' }}>{item.name}</Text>
              <Text style={{ color: '#9aa0a6', fontSize: 12 }}>
                {item.matches} match(es) · K/D {item.deaths > 0 ? (item.kills / item.deaths).toFixed(2) : item.kills}
              </Text>
            </View>
            <Text style={styles.stats}>
              {item.kills}K / {item.deaths}D / {item.assists}A
            </Text>
          </Pressable>
        )}
      />
    </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    fontWeight: '700',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'capitalize',
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  rank: { width: 32, fontWeight: '700', color: '#9aa0a6' },
  stats: { color: '#9aa0a6' },
});
