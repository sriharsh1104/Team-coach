import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as statsApi from '../../api/stats';
import { PlayerStatsResponse } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'PlayerStats'>;

export function PlayerStatsScreen({ route }: Props) {
  const { userId, name } = route.params;
  const [data, setData] = useState<PlayerStatsResponse | null>(null);

  useEffect(() => {
    statsApi.getPlayerStats(userId).then(setData);
  }, [userId]);

  if (!data) {
    return (
      <View style={sharedStyles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  const kd = data.totals.deaths > 0 ? (data.totals.kills / data.totals.deaths).toFixed(2) : data.totals.kills;

  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>{name}</Text>
      <View style={styles.totalsRow}>
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{data.totals.kills}</Text>
          <Text style={styles.totalLabel}>Kills</Text>
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{data.totals.deaths}</Text>
          <Text style={styles.totalLabel}>Deaths</Text>
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{data.totals.assists}</Text>
          <Text style={styles.totalLabel}>Assists</Text>
        </View>
        <View style={styles.totalCard}>
          <Text style={styles.totalValue}>{kd}</Text>
          <Text style={styles.totalLabel}>K/D</Text>
        </View>
      </View>
      <Text style={styles.matchCount}>{data.matches} match(es) recorded</Text>

      <FlatList
        data={data.entries}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#888', marginTop: 24 }}>
            No confirmed stats yet.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.entryRow}>
            <Text>{new Date(item.recordedAt).toLocaleDateString()}</Text>
            <Text>
              {item.kills}K / {item.deaths}D / {item.assists}A
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  totalCard: { alignItems: 'center', flex: 1 },
  totalValue: { fontSize: 24, fontWeight: '700' },
  totalLabel: { color: '#888', fontSize: 12 },
  matchCount: { textAlign: 'center', color: '#888', marginBottom: 16 },
  entryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
});
