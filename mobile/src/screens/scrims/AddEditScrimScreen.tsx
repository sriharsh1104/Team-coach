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
import { confirmAsync } from '../../ui/confirmAsync';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useSharedStyles } from '../shared';

type Props = NativeStackScreenProps<MainStackParamList, 'AddEditScrim'>;

type RoundDraft = {
  roundNumber: number;
  scheduledAt: Date;
  result: ScrimRoundResult;
};

export function AddEditScrimScreen({ navigation, route }: Props) {
  const shared = useSharedStyles();
  const { colors } = useTheme();
  const styles = useThemedStyles(addEditScrimStyles);
  const existing = route.params?.scrim;
  const isEditing = Boolean(existing);

  const [type, setType] = useState<ScrimEventType>(
    existing?.type ?? route.params?.defaultType ?? 'SCRIM',
  );
  const [title, setTitle] = useState(existing?.title ?? '');
  const [platform, setPlatform] = useState(existing?.platform ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [remind30, setRemind30] = useState(existing?.remind30 ?? true);
  const [remind10, setRemind10] = useState(existing?.remind10 ?? true);
  const [rounds, setRounds] = useState<RoundDraft[]>(() => {
    const promptNext = route.params?.promptNextRound === true;
    if (existing?.rounds?.length) {
      const mapped = existing.rounds.map((r) => ({
        roundNumber: r.roundNumber,
        scheduledAt: new Date(r.scheduledAt),
        result: r.result,
      }));
      if (promptNext && existing.type === 'TOURNAMENT') {
        const last = mapped[mapped.length - 1];
        if (last && last.result !== 'ELIMINATED') {
          last.result = 'QUALIFIED';
        }
        if (mapped[mapped.length - 1]?.result === 'QUALIFIED') {
          const nextDate = new Date(mapped[mapped.length - 1].scheduledAt);
          nextDate.setDate(nextDate.getDate() + 1);
          mapped.push({
            roundNumber: mapped.length + 1,
            scheduledAt: nextDate,
            result: 'PENDING',
          });
        }
      }
      return mapped;
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
      /* API error toasted by axios interceptor */
    } finally {
      setIsSaving(false);
    }
  };

  const onDelete = async () => {
    if (!existing) return;
    const confirmed = await confirmAsync(
      'Delete Entry',
      `Remove "${existing.title}"?`,
      'Delete',
    );
    if (!confirmed) return;
    try {
      await scrimsApi.deleteScrim(existing.id);
      navigation.goBack();
    } catch (err: any) {
      /* API error toasted by axios interceptor */
    }
  };

  return (
    <Screen>
      <ScrollView
        style={staticStyles.scroll}
        contentContainerStyle={staticStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={shared.title}>
          {isEditing ? 'Edit Entry' : 'Add Scrim / Tournament'}
        </Text>

        <View style={staticStyles.row}>
          <Pressable
            style={[staticStyles.pill, type === 'SCRIM' && styles.pillActive]}
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
            style={[staticStyles.pill, type === 'TOURNAMENT' && styles.pillActive]}
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
          style={shared.input}
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
              {route.params?.promptNextRound
                ? 'Last round marked Qualified. Set the next round date & time, then Save — reminders will use that time.'
                : 'Add as many rounds as needed. After you Qualify, set the next round date & time.'}
            </Text>

            {rounds.map((round, index) => (
              <View key={`round-${round.roundNumber}-${index}`} style={styles.roundCard}>
                <View style={staticStyles.roundHeader}>
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

                <View style={staticStyles.row}>
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
                        staticStyles.pill,
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
          style={shared.input}
          placeholder="Platform / link (e.g. Discord invite)"
          placeholderTextColor={colors.textDim}
          autoCapitalize="none"
          value={platform}
          onChangeText={setPlatform}
        />
        <TextInput
          style={[shared.input, { height: 80 }]}
          placeholder="Notes (optional)"
          placeholderTextColor={colors.textDim}
          multiline
          value={notes}
          onChangeText={setNotes}
        />

        <Pressable
          style={[
            shared.button,
            (!title.trim() || isSaving) && shared.buttonDisabled,
          ]}
          disabled={!title.trim() || isSaving}
          onPress={onSave}
        >
          <ButtonLabel icon="save">{isSaving ? 'Saving…' : 'Save'}</ButtonLabel>
        </Pressable>

        {isEditing && (
          <Pressable style={shared.link} onPress={onDelete}>
            <Text style={[shared.link, { color: '#dc2626' }]}>
              Delete Entry
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
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
  roundHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function addEditScrimStyles(c: ThemeColors) {
  return {
    pillActive: { backgroundColor: c.chrome, borderColor: c.chrome },
    pillText: { color: c.text },
    pillTextActive: { color: c.chromeInk },
    sectionLabel: {
      marginTop: 8,
      marginBottom: 4,
      fontWeight: '700' as const,
      color: c.text,
      textTransform: 'capitalize' as const,
    },
    sectionHint: {
      color: c.textMuted,
      fontSize: 12,
      marginBottom: 10,
    },
    checkRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
      backgroundColor: c.surface,
    },
    checkRowOn: { borderColor: c.chrome },
    checkMark: { color: c.chrome, fontWeight: '700' as const, width: 18 },
    checkText: { color: c.text, fontWeight: '600' as const },
    roundCard: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      backgroundColor: 'rgba(255,255,255,0.03)',
    },
    roundTitle: { color: c.text, fontWeight: '700' as const },
    remove: { color: c.danger, fontWeight: '600' as const },
    addRoundBtn: {
      alignItems: 'center' as const,
      paddingVertical: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      borderStyle: 'dashed' as const,
    },
    addRoundText: { color: c.link, fontWeight: '700' as const },
  };
}
