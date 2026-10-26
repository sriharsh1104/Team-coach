import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Image,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as statsApi from '../../api/stats';
import * as orgApi from '../../api/org';
import { apiBaseUrl } from '../../api/client';
import { ExtractionRow, OrgMember } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'ExtractionReview'>;

export function ExtractionReviewScreen({ navigation, route }: Props) {
  const { extraction } = route.params;
  const [rows, setRows] = useState<ExtractionRow[]>(extraction.rows);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    orgApi.getMyOrg().then((org) => setMembers(org.members));
  }, []);

  const updateRow = (index: number, patch: Partial<ExtractionRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const onConfirm = async () => {
    setIsSaving(true);
    try {
      await statsApi.updateExtractionRows(extraction.id, rows);
      const result = await statsApi.confirmExtraction(extraction.id);
      Alert.alert(
        'Stats saved',
        `${result.confirmedRows} player(s) updated${
          result.skippedRows > 0 ? `, ${result.skippedRows} skipped (no player matched)` : ''
        }.`,
      );
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Could not save', err?.response?.data?.message?.toString() ?? '');
    } finally {
      setIsSaving(false);
    }
  };

  const onReject = () => {
    Alert.alert('Discard this extraction?', 'No stats will be saved.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          await statsApi.rejectExtraction(extraction.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 24 }}>
      <Text style={sharedStyles.title}>Review AI Stats</Text>
      <Text style={{ color: '#888', marginBottom: 16, textAlign: 'center' }}>
        Check the AI's reading before saving. Tap a name to match it to a teammate.
      </Text>

      {extraction.mediaUrl && (
        <Image
          source={{ uri: `${apiBaseUrl}${extraction.mediaUrl}` }}
          style={styles.preview}
          resizeMode="contain"
        />
      )}

      {rows.map((row, index) => (
        <View key={index} style={styles.card}>
          <TextInput
            style={sharedStyles.input}
            value={row.rawName}
            onChangeText={(text) => updateRow(index, { rawName: text })}
            placeholder="Name as read from screenshot"
          />
          <Text style={styles.label}>Match to:</Text>
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, !row.matchedUserId && styles.chipActive]}
              onPress={() => updateRow(index, { matchedUserId: null })}
            >
              <Text style={!row.matchedUserId ? styles.chipTextActive : styles.chipText}>
                No match
              </Text>
            </Pressable>
            {members.map((m) => (
              <Pressable
                key={m.userId}
                style={[styles.chip, row.matchedUserId === m.userId && styles.chipActive]}
                onPress={() => updateRow(index, { matchedUserId: m.userId })}
              >
                <Text style={row.matchedUserId === m.userId ? styles.chipTextActive : styles.chipText}>
                  {m.name}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.statRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Kills</Text>
              <TextInput
                style={sharedStyles.input}
                keyboardType="number-pad"
                value={String(row.kills)}
                onChangeText={(text) => updateRow(index, { kills: Number(text) || 0 })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Deaths</Text>
              <TextInput
                style={sharedStyles.input}
                keyboardType="number-pad"
                value={String(row.deaths)}
                onChangeText={(text) => updateRow(index, { deaths: Number(text) || 0 })}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Assists</Text>
              <TextInput
                style={sharedStyles.input}
                keyboardType="number-pad"
                value={String(row.assists)}
                onChangeText={(text) => updateRow(index, { assists: Number(text) || 0 })}
              />
            </View>
          </View>
        </View>
      ))}

      <Pressable
        style={[sharedStyles.button, isSaving && sharedStyles.buttonDisabled]}
        disabled={isSaving}
        onPress={onConfirm}
      >
        <Text style={sharedStyles.buttonText}>{isSaving ? 'Saving…' : 'Confirm & Save Stats'}</Text>
      </Pressable>
      <Pressable style={sharedStyles.link} onPress={onReject}>
        <Text style={[sharedStyles.link, { color: '#dc2626' }]}>Discard this extraction</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 220, marginBottom: 16, backgroundColor: '#f1f1f1' },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  label: { color: '#888', fontSize: 12, marginBottom: 6, marginTop: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { color: '#111', fontSize: 13 },
  chipTextActive: { color: '#fff', fontSize: 13 },
  statRow: { flexDirection: 'row', gap: 8 },
});
