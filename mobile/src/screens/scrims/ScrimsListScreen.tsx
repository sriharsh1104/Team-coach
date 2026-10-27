import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  Linking,
  Alert,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import * as scrimsApi from '../../api/scrims';
import { useAuth } from '../../auth/AuthContext';
import { ScrimEvent } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'Scrims'>;

// The backend only orders rounds by roundNumber asc and never derives a
// "last round" date onto the event itself — so "is this done, and when was
// its last action" has to be computed client-side from the rounds array.
function lastRelevantDate(event: ScrimEvent): number {
  const last = event.rounds[event.rounds.length - 1];
  return new Date(last ? last.scheduledAt : event.scheduledAt).getTime();
}

function isHistorical(event: ScrimEvent): boolean {
  const last = event.rounds[event.rounds.length - 1];
  if (last?.result === 'ELIMINATED') return true;
  return lastRelevantDate(event) < Date.now();
}

export function ScrimsListScreen({ navigation }: Props) {
  const { user, org } = useAuth();
  const [events, setEvents] = useState<ScrimEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');

  const load = useCallback(async () => {
    const data = await scrimsApi.listScrims();
    setEvents(data);
  }, []);

  // Reload every time this screen gains focus (not just on first mount) so
  // creating/editing/deleting an entry on the other screen is reflected here
  // as soon as you navigate back.
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

  const onDelete = (event: ScrimEvent) => {
    Alert.alert('Delete entry', `Remove "${event.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await scrimsApi.deleteScrim(event.id);
          load();
        },
      },
    ]);
  };

  const canEdit = (event: ScrimEvent) =>
    event.createdById === user?.id || org?.role === 'COACH' || org?.isOwner === true;

  const upcoming = events
    .filter((e) => !isHistorical(e))
    .sort((a, b) => lastRelevantDate(a) - lastRelevantDate(b));
  const history = events
    .filter(isHistorical)
    .sort((a, b) => lastRelevantDate(b) - lastRelevantDate(a));
  const data = tab === 'upcoming' ? upcoming : history;

  return (
    <Screen>
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>Scrims & Tournaments</Text>

      <Pressable
        style={sharedStyles.button}
        onPress={() => navigation.navigate('AddEditScrim')}
      >
        <ButtonLabel icon="calendar">Add Scrim / Tournament</ButtonLabel>
      </Pressable>

      <View style={styles.tabRow}>
        {(
          [
            ['upcoming', 'Upcoming'],
            ['history', 'History'],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.tab, tab === value && styles.tabActive]}
            onPress={() => setTab(value)}
          >
            <Text style={tab === value ? styles.tabTextActive : styles.tabText}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#9aa0a6', marginTop: 24 }}>
            {tab === 'upcoming' ? 'Nothing scheduled yet.' : 'No history yet.'}
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={[
                  styles.badge,
                  item.type === 'TOURNAMENT' && styles.badgeTournament,
                ]}
              >
                {item.type === 'TOURNAMENT' ? 'Tournament' : 'Scrim'}
              </Text>
              <Text style={styles.title}>{item.title}</Text>
            </View>
            <Text style={styles.meta}>
              {new Date(item.scheduledAt).toLocaleString()} · by{' '}
              {item.createdByName}
              {item.rounds?.length
                ? ` · ${item.rounds.length} Round(s)`
                : ''}
            </Text>
            {item.platform && (
              <Pressable onPress={() => Linking.openURL(item.platform!)}>
                <Text style={styles.link}>{item.platform}</Text>
              </Pressable>
            )}
            {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
            {canEdit(item) && (
              <View style={styles.actionsRow}>
                <Pressable
                  onPress={() => navigation.navigate('AddEditScrim', { scrim: item })}
                >
                  <Text style={styles.action}>Edit</Text>
                </Pressable>
                <Pressable onPress={() => onDelete(item)}>
                  <Text style={[styles.action, { color: '#dc2626' }]}>Delete</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      />
    </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  tab: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  tabActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  tabText: { color: '#f2f3f5', fontWeight: '600' },
  tabTextActive: { color: '#0a0a0c', fontWeight: '600' },
  row: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#3a3d44',
  },
  badge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    backgroundColor: '#555',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 8,
    overflow: 'hidden',
  },
  badgeTournament: { backgroundColor: '#b45309' },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1, color: '#f2f3f5' },
  meta: { color: '#9aa0a6', fontSize: 12, marginTop: 4 },
  link: { color: '#a8b0ff', marginTop: 4 },
  notes: { color: '#9aa0a6', marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  action: { color: '#a8b0ff', fontWeight: '600' },
});
