import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  SectionList,
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

export function ScrimsListScreen({ navigation }: Props) {
  const { user, org } = useAuth();
  const [events, setEvents] = useState<ScrimEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  const now = Date.now();
  const upcoming = events.filter((e) => new Date(e.scheduledAt).getTime() >= now);
  const past = events
    .filter((e) => new Date(e.scheduledAt).getTime() < now)
    .reverse();

  const sections = [
    { title: 'Upcoming', data: upcoming },
    { title: 'Past', data: past },
  ].filter((s) => s.data.length > 0);

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

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', color: '#9aa0a6', marginTop: 24 }}>
            Nothing scheduled yet.
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
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
  sectionHeader: {
    fontWeight: '700',
    fontSize: 16,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'capitalize',
    color: '#e8eaed',
  },
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
