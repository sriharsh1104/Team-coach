import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import {
  completeRoutine,
  createRoutine,
  deleteRoutine,
  listRoutines,
  localDay,
  RoutineRow,
  uncompleteRoutine,
  updateRoutine,
} from '../../api/tracker';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { confirmAsync } from '../../ui/confirmAsync';
import { emitToast } from '../../ui/toastBus';
import { useDateTimeFormat } from '../../datetime/DateTimeFormatContext';
import {
  canUseExactAlarms,
  formatTimeLocal,
  openExactAlarmSettings,
  parseTimeLocal,
  syncRoutineAlarms,
} from '../../tracker/routineAlarms';

function timeToDate(timeLocal: string): Date {
  const parsed = parseTimeLocal(timeLocal) ?? { hour: 8, minute: 0 };
  const d = new Date();
  d.setHours(parsed.hour, parsed.minute, 0, 0);
  return d;
}

/**
 * Daily timed habits — create/edit routines, ring via Android AlarmManager
 * (notification fallback), and mark each item done for today.
 */
export function DailyRoutineScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { timeFormat, formatTime } = useDateTimeFormat();
  const use24Hour = timeFormat === 'h24';
  const [rows, setRows] = useState<RoutineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [alarmMode, setAlarmMode] = useState<'exact' | 'notification' | 'none'>(
    'none',
  );
  const [editor, setEditor] = useState<null | {
    id?: string;
    title: string;
    timeLocal: string;
    alarmEnabled: boolean;
  }>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await listRoutines(localDay());
      setRows(list);
      const sync = await syncRoutineAlarms(list);
      setAlarmMode(sync.mode);
    } catch {
      emitToast('Could not load routines');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh();
    }, [refresh]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const toggleDone = async (row: RoutineRow) => {
    const day = localDay();
    try {
      if (row.doneToday) {
        await uncompleteRoutine(row.id, day);
      } else {
        await completeRoutine(row.id, day);
      }
      await refresh();
    } catch {
      emitToast('Could not update routine');
    }
  };

  const openCreate = () => {
    setEditor({
      title: '',
      timeLocal: '08:00',
      alarmEnabled: true,
    });
  };

  const openEdit = (row: RoutineRow) => {
    setEditor({
      id: row.id,
      title: row.title,
      timeLocal: row.timeLocal,
      alarmEnabled: row.alarmEnabled,
    });
  };

  const saveEditor = async () => {
    if (!editor) return;
    const title = editor.title.trim();
    if (!title) {
      emitToast('Enter a title');
      return;
    }
    setBusy(true);
    try {
      if (editor.id) {
        await updateRoutine(editor.id, {
          title,
          timeLocal: editor.timeLocal,
          alarmEnabled: editor.alarmEnabled,
        });
      } else {
        await createRoutine({
          title,
          timeLocal: editor.timeLocal,
          alarmEnabled: editor.alarmEnabled,
        });
      }
      const enabledAlarm = editor.alarmEnabled;
      setEditor(null);
      setShowPicker(false);
      await refresh();
      if (enabledAlarm) {
        if (canUseExactAlarms()) {
          emitToast('Alarm set — phone will ring at that time');
        } else {
          emitToast(
            'Reminder saved as notification. Enable Exact Alarms for a loud wake ring.',
          );
        }
      }
    } catch {
      emitToast('Could not save routine');
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (row: RoutineRow) => {
    const ok = await confirmAsync(
      'Delete Routine',
      `Remove “${row.title}” from your daily list?`,
    );
    if (!ok) return;
    try {
      await deleteRoutine(row.id);
      await refresh();
    } catch {
      emitToast('Could not delete routine');
    }
  };

  if (loading && rows.length === 0) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  const needsExactGrant =
    Platform.OS === 'android' && alarmMode !== 'exact' && !canUseExactAlarms();

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {needsExactGrant ? (
              <View style={styles.banner}>
                <Text style={styles.bannerTitle}>Enable Exact Alarms</Text>
                <Text style={styles.bannerBody}>
                  Allow exact alarms so routines can ring like the system clock.
                  Until then, a quieter notification reminder is used.
                </Text>
                <SoftPressable
                  style={styles.bannerBtn}
                  onPress={openExactAlarmSettings}
                >
                  <Text style={styles.bannerBtnText}>Open Alarm Settings</Text>
                </SoftPressable>
              </View>
            ) : null}
            <SoftPressable style={styles.addBtn} onPress={openCreate}>
              <AppIcon name="add-circle-outline" size={20} color={colors.chromeInk} />
              <Text style={styles.addBtnText}>Add Routine</Text>
            </SoftPressable>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            No routines yet. Add something timed for today.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable
              style={styles.checkHit}
              onPress={() => void toggleDone(item)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.doneToday }}
            >
              <AppIcon
                name={item.doneToday ? 'checkmark-circle' : 'checkmark'}
                size={26}
                color={item.doneToday ? colors.link : colors.textDim}
              />
            </Pressable>
            <Pressable style={styles.rowBody} onPress={() => openEdit(item)}>
              <Text
                style={[
                  styles.rowTitle,
                  item.doneToday ? styles.rowTitleDone : null,
                ]}
                numberOfLines={2}
              >
                {item.title}
              </Text>
              <Text style={styles.rowMeta}>
                {formatTime(timeToDate(item.timeLocal))}
                {item.alarmEnabled ? ' · Alarm on' : ' · Alarm off'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void removeRow(item)}
              hitSlop={10}
              accessibilityLabel="Delete routine"
            >
              <AppIcon name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        )}
      />

      <Modal
        visible={!!editor}
        transparent
        animationType="fade"
        onRequestClose={() => setEditor(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setEditor(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {editor?.id ? 'Edit Routine' : 'New Routine'}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="What to do"
              placeholderTextColor={colors.textDim}
              value={editor?.title ?? ''}
              onChangeText={(title) =>
                setEditor((prev) => (prev ? { ...prev, title } : prev))
              }
              maxLength={80}
            />
            <SoftPressable
              style={styles.timeBtn}
              onPress={() => setShowPicker(true)}
            >
              <AppIcon name="alarm-outline" size={18} color={colors.icon} />
              <Text style={styles.timeBtnText}>
                {editor
                  ? formatTime(timeToDate(editor.timeLocal))
                  : formatTime(timeToDate('08:00'))}
              </Text>
            </SoftPressable>
            {showPicker && editor ? (
              <DateTimePicker
                value={timeToDate(editor.timeLocal)}
                mode="time"
                is24Hour={use24Hour}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, date) => {
                  if (Platform.OS === 'android') setShowPicker(false);
                  if (!date) return;
                  setEditor((prev) =>
                    prev
                      ? {
                          ...prev,
                          timeLocal: formatTimeLocal(
                            date.getHours(),
                            date.getMinutes(),
                          ),
                        }
                      : prev,
                  );
                }}
              />
            ) : null}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Alarm</Text>
              <Switch
                value={editor?.alarmEnabled ?? true}
                onValueChange={(alarmEnabled) =>
                  setEditor((prev) => (prev ? { ...prev, alarmEnabled } : prev))
                }
                trackColor={{
                  false: colors.border,
                  true: colors.link,
                }}
              />
            </View>
            <View style={styles.modalActions}>
              <SoftPressable
                style={styles.cancelBtn}
                onPress={() => setEditor(null)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </SoftPressable>
              <SoftPressable
                style={styles.saveBtn}
                onPress={() => void saveEditor()}
                disabled={busy}
              >
                <Text style={styles.saveText}>{busy ? 'Saving…' : 'Save'}</Text>
              </SoftPressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function makeStyles(c: ThemeColors) {
  return {
    center: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    list: {
      padding: 16,
      paddingBottom: 40,
      gap: 10,
    },
    headerBlock: {
      gap: 12,
      marginBottom: 8,
    },
    banner: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 14,
      gap: 8,
    },
    bannerTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700' as const,
      textTransform: 'capitalize' as const,
    },
    bannerBody: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    bannerBtn: {
      alignSelf: 'flex-start' as const,
      backgroundColor: c.chrome,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      marginTop: 4,
    },
    bannerBtnText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 14,
    },
    addBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      alignSelf: 'flex-start' as const,
      backgroundColor: c.chrome,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
    },
    addBtnText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 14,
    },
    empty: {
      color: c.textMuted,
      textAlign: 'center' as const,
      marginTop: 40,
      fontSize: 15,
      lineHeight: 22,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 10,
    },
    checkHit: {
      padding: 2,
    },
    rowBody: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '600' as const,
    },
    rowTitleDone: {
      textDecorationLine: 'line-through' as const,
      color: c.textMuted,
    },
    rowMeta: {
      color: c.textDim,
      fontSize: 13,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center' as const,
      padding: 20,
    },
    modalCard: {
      backgroundColor: c.bg,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 16,
      gap: 12,
    },
    modalTitle: {
      color: c.text,
      fontSize: 18,
      fontWeight: '700' as const,
      textTransform: 'capitalize' as const,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: c.text,
      fontSize: 16,
    },
    timeBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    timeBtnText: {
      color: c.text,
      fontSize: 16,
      fontWeight: '600' as const,
    },
    switchRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'space-between' as const,
    },
    switchLabel: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    modalActions: {
      flexDirection: 'row' as const,
      justifyContent: 'flex-end' as const,
      gap: 10,
      marginTop: 4,
    },
    cancelBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelText: {
      color: c.textMuted,
      fontWeight: '600' as const,
    },
    saveBtn: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.chrome,
    },
    saveText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
    },
  };
}
