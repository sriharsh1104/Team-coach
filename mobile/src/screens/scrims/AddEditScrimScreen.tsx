import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  Alert,
  StyleSheet,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as scrimsApi from '../../api/scrims';
import { ScrimEventType } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditScrim'>;

export function AddEditScrimScreen({ navigation, route }: Props) {
  const existing = route.params?.scrim;
  const isEditing = Boolean(existing);

  const [type, setType] = useState<ScrimEventType>(existing?.type ?? 'SCRIM');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [scheduledAt, setScheduledAt] = useState(
    existing ? new Date(existing.scheduledAt) : new Date(),
  );
  const [platform, setPlatform] = useState(existing?.platform ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [webDateText, setWebDateText] = useState(
    existing
      ? new Date(existing.scheduledAt).toISOString().slice(0, 16)
      : new Date().toISOString().slice(0, 16),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const onSave = async () => {
    if (!title.trim()) return;

    const finalScheduledAt =
      Platform.OS === 'web' ? new Date(webDateText) : scheduledAt;
    if (isNaN(finalScheduledAt.getTime())) {
      Alert.alert('Invalid date/time', 'Please check the date and time.');
      return;
    }

    setIsSaving(true);
    try {
      const input = {
        type,
        title: title.trim(),
        scheduledAt: finalScheduledAt.toISOString(),
        platform: platform || undefined,
        notes: notes || undefined,
      };
      if (isEditing && existing) {
        await scrimsApi.updateScrim(existing.id, input);
      } else {
        await scrimsApi.createScrim(input);
      }
      navigation.goBack();
    } catch (err: any) {
      Alert.alert(
        'Could not save',
        err?.response?.data?.message?.toString() ?? 'Please try again.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = () => {
    if (!existing) return;
    Alert.alert('Delete entry', `Remove "${existing.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await scrimsApi.deleteScrim(existing.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={sharedStyles.container}>
      <Text style={sharedStyles.title}>
        {isEditing ? 'Edit Entry' : 'Add Scrim / Tournament'}
      </Text>

      <View style={styles.row}>
        <Pressable
          style={[styles.pill, type === 'SCRIM' && styles.pillActive]}
          onPress={() => setType('SCRIM')}
        >
          <Text style={type === 'SCRIM' ? styles.pillTextActive : styles.pillText}>
            Scrim
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, type === 'TOURNAMENT' && styles.pillActive]}
          onPress={() => setType('TOURNAMENT')}
        >
          <Text style={type === 'TOURNAMENT' ? styles.pillTextActive : styles.pillText}>
            Tournament
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={sharedStyles.input}
        placeholder="Title (e.g. Practice vs Team Beta)"
        value={title}
        onChangeText={setTitle}
      />

      {Platform.OS === 'web' ? (
        <TextInput
          style={sharedStyles.input}
          placeholder="YYYY-MM-DDTHH:MM"
          value={webDateText}
          onChangeText={setWebDateText}
        />
      ) : (
        <View style={styles.row}>
          <Pressable style={styles.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text>{scheduledAt.toLocaleDateString()}</Text>
          </Pressable>
          <Pressable style={styles.dateButton} onPress={() => setShowTimePicker(true)}>
            <Text>
              {scheduledAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Pressable>
        </View>
      )}
      {showDatePicker && (
        <DateTimePicker
          value={scheduledAt}
          mode="date"
          onChange={(_e, date) => {
            setShowDatePicker(false);
            if (date) {
              const next = new Date(scheduledAt);
              next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
              setScheduledAt(next);
            }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={scheduledAt}
          mode="time"
          onChange={(_e, date) => {
            setShowTimePicker(false);
            if (date) {
              const next = new Date(scheduledAt);
              next.setHours(date.getHours(), date.getMinutes());
              setScheduledAt(next);
            }
          }}
        />
      )}

      <TextInput
        style={sharedStyles.input}
        placeholder="Platform / link (e.g. Discord invite)"
        autoCapitalize="none"
        value={platform}
        onChangeText={setPlatform}
      />
      <TextInput
        style={[sharedStyles.input, { height: 80 }]}
        placeholder="Notes (optional)"
        multiline
        value={notes}
        onChangeText={setNotes}
      />

      <Pressable
        style={[sharedStyles.button, (!title.trim() || isSaving) && sharedStyles.buttonDisabled]}
        disabled={!title.trim() || isSaving}
        onPress={onSave}
      >
        <Text style={sharedStyles.buttonText}>{isSaving ? 'Saving…' : 'Save'}</Text>
      </Pressable>

      {isEditing && (
        <Pressable style={sharedStyles.link} onPress={onDelete}>
          <Text style={[sharedStyles.link, { color: '#dc2626' }]}>Delete entry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  pill: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillActive: { backgroundColor: '#111', borderColor: '#111' },
  pillText: { color: '#111' },
  pillTextActive: { color: '#fff' },
  dateButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
