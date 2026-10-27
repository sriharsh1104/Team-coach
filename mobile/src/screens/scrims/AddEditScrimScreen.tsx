import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Alert,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as scrimsApi from '../../api/scrims';
import { ScrimEventType, ScrimRoundResult } from '../../api/types';
import { MainStackParamList } from '../../navigation/types';
import { Screen } from '../../brand/Screen';
import { ButtonLabel } from '../../ui/ButtonLabel';
import { ScheduleDateTimeField, defaultEventTimeToPM } from '../../ui/ScheduleDateTimeField';
import { colors } from '../../theme';
import { sharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditScrim'>;

type RoundDraft = {
  roundNumber: number;
  scheduledAt: Date;
  result: ScrimRoundResult;
};

export function AddEditScrimScreen({ navigation, route }: Props) {
  const existing = route.params?.scrim;
  const isEditing = Boolean(existing);

  const [type, setType] = useState<ScrimEventType>(existing?.type ?? 'SCRIM');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [platform, setPlatform] = useState(existing?.platform ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [remind30, setRemind30] = useState(existing?.remind30 ?? true);
  const [remind10, setRemind10] = useState(existing?.remind10 ?? true);
  const [rounds, setRounds] = useState<RoundDraft[]>(() => {
    if (existing?.rounds?.length) {
      return existing.rounds.map((r) => ({
        roundNumber: r.roundNumber,
        scheduledAt: new Date(r.scheduledAt),
        result: r.result,
      }));
    }
    return [
      {
        roundNumber: 1,
        scheduledAt: existing ? new Date(existing.scheduledAt) : defaultEventTimeToPM(),
        result: 'PENDING',
      },
    ];
  });
  const [isSaving, setIsSaving] = useState(false);

  const updateRound = (index: number, patch: Partial<RoundDraft>) => {
    setRounds((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  };

  const addRound = () => {
    setRounds((prev) => {
      const last = prev[prev.length - 1];
      const nextDate = new Date(last?.scheduledAt ?? Date.now());
      nextDate.setDate(nextDate.getDate() + 1);
      return [
        ...prev,
        {
          roundNumber: (last?.roundNumber ?? 0) + 1,
          scheduledAt: nextDate,
          result: 'PENDING',
        },
      ];
    });
  };

  const removeRound = (index: number) => {
    if (rounds.length <= 1) return;
    setRounds((prev) =>
      prev
        .filter((_, i) => i !== index)
        .map((r, i) => ({ ...r, roundNumber: i + 1 })),
    );
  };

  const onSave = async () => {
    if (!title.trim()) return;
    if (rounds.some((r) => isNaN(r.scheduledAt.getTime()))) {
      Alert.alert('Invalid Date / Time', 'Please check every round date.');
      return;
    }

    setIsSaving(true);
    try {
      const input = {
        type,
        title: title.trim(),
        scheduledAt: rounds[0].scheduledAt.toISOString(),
        platform: platform || undefined,
        notes: notes || undefined,
        remind30,
        remind10,
        rounds: rounds.map((r) => ({
          roundNumber: r.roundNumber,
          scheduledAt: r.scheduledAt.toISOString(),
          result: r.result,
        })),
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
    Alert.alert('Delete Entry', `Remove "${existing.title}"?`, [
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
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={sharedStyles.title}>
          {isEditing ? 'Edit Entry' : 'Add Scrim / Tournament'}
        </Text>

        <View style={styles.row}>
          <Pressable
            style={[styles.pill, type === 'SCRIM' && styles.pillActive]}
            onPress={() => {
              setType('SCRIM');
              // Scrims don't have a qualification/rounds concept — collapse
              // back to a single date whenever switching away from Tournament.
              setRounds((prev) => [{ ...prev[0], result: 'PENDING' }]);
            }}
          >
            <Text style={type === 'SCRIM' ? styles.pillTextActive : styles.pillText}>
              Scrim
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, type === 'TOURNAMENT' && styles.pillActive]}
            onPress={() => setType('TOURNAMENT')}
          >
            <Text
              style={type === 'TOURNAMENT' ? styles.pillTextActive : styles.pillText}
            >
              Tournament
            </Text>
          </Pressable>
        </View>

        <TextInput
          style={sharedStyles.input}
          placeholder="Title (e.g. Practice vs Team Beta)"
          placeholderTextColor={colors.textDim}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.sectionLabel}>Team Reminders</Text>
        <Text style={styles.sectionHint}>
          Push to the whole team before each round start
        </Text>
        <Pressable
          style={[styles.checkRow, remind30 && styles.checkRowOn]}
          onPress={() => setRemind30((v) => !v)}
        >
          <Text style={styles.checkMark}>{remind30 ? '✓' : '○'}</Text>
          <Text style={styles.checkText}>30 Minutes Before</Text>
        </Pressable>
        <Pressable
          style={[styles.checkRow, remind10 && styles.checkRowOn]}
          onPress={() => setRemind10((v) => !v)}
        >
          <Text style={styles.checkMark}>{remind10 ? '✓' : '○'}</Text>
          <Text style={styles.checkText}>10 Minutes Before</Text>
        </Pressable>

        {type === 'SCRIM' ? (
          // Scrims are a single practice match — no rounds/qualification
          // concept, which only makes sense for a tournament bracket.
          <ScheduleDateTimeField
            label="Date & Time"
            value={rounds[0].scheduledAt}
            onChange={(date) => updateRound(0, { scheduledAt: date })}
          />
        ) : (
          <>
            <Text style={styles.sectionLabel}>Rounds</Text>
            <Text style={styles.sectionHint}>
              Add as many rounds as needed. After you Qualify, set the next
              round date & time.
            </Text>

            {rounds.map((round, index) => (
              <View key={`round-${round.roundNumber}-${index}`} style={styles.roundCard}>
                <View style={styles.roundHeader}>
                  <Text style={styles.roundTitle}>Round {round.roundNumber}</Text>
                  {rounds.length > 1 && (
                    <Pressable onPress={() => removeRound(index)}>
                      <Text style={styles.remove}>Remove</Text>
                    </Pressable>
                  )}
                </View>

                <ScheduleDateTimeField
                  label="Date & Time"
                  value={round.scheduledAt}
                  onChange={(date) => updateRound(index, { scheduledAt: date })}
                />

                <View style={styles.row}>
                  {(
                    [
                      ['PENDING', 'Pending'],
                      ['QUALIFIED', 'Qualified'],
                      ['ELIMINATED', 'Eliminated'],
                    ] as const
                  ).map(([value, label]) => (
                    <Pressable
                      key={value}
                      style={[
                        styles.pill,
                        round.result === value && styles.pillActive,
                      ]}
                      onPress={() => {
                        updateRound(index, { result: value });
                        if (
                          value === 'QUALIFIED' &&
                          index === rounds.length - 1
                        ) {
                          addRound();
                        }
                      }}
                    >
                      <Text
                        style={
                          round.result === value
                            ? styles.pillTextActive
                            : styles.pillText
                        }
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}

            {rounds[rounds.length - 1]?.result === 'QUALIFIED' && (
              <Pressable style={styles.addRoundBtn} onPress={addRound}>
                <Text style={styles.addRoundText}>+ Add Round</Text>
              </Pressable>
            )}
          </>
        )}

        <TextInput
          style={sharedStyles.input}
          placeholder="Platform / link (e.g. Discord invite)"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          value={platform}
          onChangeText={setPlatform}
        />
        <TextInput
          style={[sharedStyles.input, { height: 80 }]}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.textDim}
          multiline
          value={notes}
          onChangeText={setNotes}
        />

        <Pressable
          style={[
            sharedStyles.button,
            (!title.trim() || isSaving) && sharedStyles.buttonDisabled,
          ]}
          disabled={!title.trim() || isSaving}
          onPress={onSave}
        >
          <ButtonLabel icon="save">{isSaving ? 'Saving…' : 'Save'}</ButtonLabel>
        </Pressable>

        {isEditing && (
          <Pressable style={sharedStyles.link} onPress={onDelete}>
            <Text style={[sharedStyles.link, { color: '#dc2626' }]}>
              Delete Entry
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 24, paddingBottom: 40 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  pill: {
    borderWidth: 1,
    borderColor: '#5f6368',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pillActive: { backgroundColor: '#c9ccd1', borderColor: '#c9ccd1' },
  pillText: { color: '#f2f3f5' },
  pillTextActive: { color: '#0a0a0c' },
  sectionLabel: {
    marginTop: 8,
    marginBottom: 4,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'capitalize',
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 10,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  checkRowOn: { borderColor: colors.chrome },
  checkMark: { color: colors.chrome, fontWeight: '700', width: 18 },
  checkText: { color: colors.text, fontWeight: '600' },
  roundCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roundTitle: { color: colors.text, fontWeight: '700' },
  remove: { color: colors.danger, fontWeight: '600' },
  addRoundBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addRoundText: { color: colors.link, fontWeight: '700' },
});
