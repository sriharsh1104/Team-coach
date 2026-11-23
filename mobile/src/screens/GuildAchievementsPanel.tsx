import React, { useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import * as orgApi from '../api/org';
import { GuildAchievement } from '../api/types';
import { resolveMediaUrl } from '../api/client';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { SoftPressable } from '../ui/SoftPressable';
import { AppIcon } from '../ui/AppIcon';
import { emitToast } from '../ui/toastBus';
import { confirmAsync } from '../ui/confirmAsync';

function errorMessage(err: unknown, fallback: string) {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : msg?.toString() || fallback;
}

function toIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIsoDate(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDisplayDate(iso: string) {
  const d = parseIsoDate(iso);
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function todayIso() {
  return toIsoDate(new Date());
}

type PickedTable = { uri: string; fileName: string; mimeType: string };

type Props = {
  achievements: GuildAchievement[];
  canManage: boolean;
  onChanged: () => void;
};

/**
 * Guild trophy shelf — grand-final tournament finishes.
 * Visible to every guild member; only the org owner can add/remove.
 * Points are a screenshot of the points table, not a number.
 */
export function GuildAchievementsPanel({
  achievements,
  canManage,
  onChanged,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(panelStyles);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [standing, setStanding] = useState('');
  const [link, setLink] = useState('');
  const [pointsTable, setPointsTable] = useState<PickedTable | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dateValue = useMemo(() => parseIsoDate(date), [date]);

  const canSubmit =
    name.trim().length >= 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) &&
    standing.trim().length >= 1 &&
    !saving;

  const onPickPointsTable = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow gallery access to attach a points-table screenshot.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setPointsTable({
      uri: asset.uri,
      fileName: asset.fileName ?? `points-table-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    });
  };

  const onAdd = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await orgApi.createGuildAchievement({
        name: name.trim(),
        date: date.trim(),
        standing: standing.trim(),
        ...(link.trim() ? { grandFinalLink: link.trim() } : {}),
        ...(pointsTable ? { pointsTable } : {}),
      });
      setName('');
      setDate(todayIso());
      setStanding('');
      setLink('');
      setPointsTable(null);
      emitToast('Achievement added');
      onChanged();
    } catch (err) {
      emitToast(errorMessage(err, 'Could not add achievement'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item: GuildAchievement) => {
    const confirmed = await confirmAsync(
      'Remove Achievement',
      `Remove “${item.name}” from the guild achievements?`,
      'Remove',
      'Cancel',
    );
    if (!confirmed) return;
    setBusyId(item.id);
    try {
      await orgApi.deleteGuildAchievement(item.id);
      emitToast('Achievement removed');
      onChanged();
    } catch (err) {
      emitToast(errorMessage(err, 'Could not remove achievement'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={staticStyles.wrap}>
      <Text style={styles.hint}>
        Grand finals this guild played — standing and optional points-table
        screenshot for everyone to see.
      </Text>

      {canManage ? (
        <View style={staticStyles.form}>
          <Text style={styles.formTitle}>Add achievement</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            value={name}
            onChangeText={setName}
            placeholder="Tournament name"
            placeholderTextColor={colors.textDim}
            accessibilityLabel="Tournament name"
          />
          {Platform.OS === 'web' ? (
            <TextInput
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              // @ts-expect-error web-only native date calendar
              type="date"
              value={date}
              onChangeText={(text) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(text)) setDate(text);
              }}
              accessibilityLabel="Grand final date"
            />
          ) : (
            <>
              <SoftPressable
                style={[
                  styles.dateBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                ]}
                onPress={() => setShowDatePicker(true)}
                pressScale={0.98}
                accessibilityRole="button"
                accessibilityLabel="Grand final date"
              >
                <AppIcon name="alarm-outline" size={18} color={colors.link} />
                <Text style={[styles.dateBtnText, { color: colors.text }]}>
                  {formatDisplayDate(date)}
                </Text>
              </SoftPressable>
              {showDatePicker ? (
                <DateTimePicker
                  value={dateValue}
                  mode="date"
                  display="calendar"
                  onChange={(_e, selected) => {
                    setShowDatePicker(false);
                    if (!selected) return;
                    setDate(toIsoDate(selected));
                  }}
                />
              ) : null}
            </>
          )}
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            value={standing}
            onChangeText={setStanding}
            placeholder="Standing (e.g. 1st)"
            placeholderTextColor={colors.textDim}
            accessibilityLabel="Standing"
          />
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            value={link}
            onChangeText={setLink}
            placeholder="Grand final link (optional)"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Grand final link, optional"
          />
          <SoftPressable
            style={[
              styles.pickBtn,
              {
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            onPress={() => void onPickPointsTable()}
            pressScale={0.97}
            accessibilityRole="button"
            accessibilityLabel="Attach points table image"
          >
            <AppIcon name="images-outline" size={18} color={colors.link} />
            <Text style={[styles.pickBtnText, { color: colors.link }]}>
              {pointsTable
                ? 'Change points table image'
                : 'Add points table image (optional)'}
            </Text>
          </SoftPressable>
          {pointsTable ? (
            <Image
              source={{ uri: pointsTable.uri }}
              style={staticStyles.preview}
              resizeMode="cover"
              accessibilityLabel="Points table preview"
            />
          ) : null}
          <SoftPressable
            style={[
              styles.addBtn,
              { backgroundColor: colors.chrome },
              !canSubmit && { opacity: 0.55 },
            ]}
            disabled={!canSubmit}
            onPress={() => void onAdd()}
            pressScale={0.96}
            accessibilityRole="button"
            accessibilityLabel="Add achievement"
          >
            <Text style={[styles.addBtnText, { color: colors.chromeInk }]}>
              {saving ? 'Saving…' : 'Add'}
            </Text>
          </SoftPressable>
        </View>
      ) : null}

      {achievements.length === 0 ? (
        <Text style={styles.empty}>
          {canManage
            ? 'No grand finals logged yet — add the first one above.'
            : 'No grand finals logged yet.'}
        </Text>
      ) : (
        achievements.map((item) => {
          const tableUri = resolveMediaUrl(item.pointsTableUrl);
          return (
            <View
              key={item.id}
              style={[styles.row, { borderBottomColor: colors.border }]}
            >
              <View style={staticStyles.rowMain}>
                <Text style={styles.name} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {formatDisplayDate(item.date)} · {item.standing}
                </Text>
                {item.grandFinalLink ? (
                  <SoftPressable
                    onPress={() =>
                      void Linking.openURL(item.grandFinalLink!).catch(() =>
                        emitToast('Could not open link'),
                      )
                    }
                    pressScale={0.98}
                    accessibilityRole="link"
                    accessibilityLabel="Open grand final link"
                  >
                    <Text style={[styles.link, { color: colors.link }]}>
                      Grand final
                    </Text>
                  </SoftPressable>
                ) : null}
                {tableUri ? (
                  <Image
                    source={{ uri: tableUri }}
                    style={staticStyles.tableImg}
                    resizeMode="contain"
                    accessibilityLabel={`${item.name} points table`}
                  />
                ) : null}
              </View>
              {canManage ? (
                <SoftPressable
                  style={[
                    staticStyles.deleteBtn,
                    { backgroundColor: colors.danger },
                    busyId === item.id && { opacity: 0.55 },
                  ]}
                  disabled={busyId === item.id}
                  onPress={() => void onDelete(item)}
                  pressScale={0.92}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.name}`}
                >
                  <AppIcon name="trash-outline" size={18} color={colors.text} />
                </SoftPressable>
              ) : null}
            </View>
          );
        })
      )}
    </View>
  );
}

const staticStyles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  form: { gap: 8, marginBottom: 16 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  preview: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tableImg: {
    width: '100%',
    height: 160,
    marginTop: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 4,
  },
});

function panelStyles(c: ThemeColors) {
  return {
    hint: {
      color: c.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: 12,
    },
    formTitle: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 14,
      marginBottom: 2,
    },
    input: {
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    dateBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dateBtnText: { fontSize: 14, fontWeight: '600' as const },
    pickBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    pickBtnText: { fontSize: 13, fontWeight: '600' as const, flex: 1 },
    addBtn: {
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center' as const,
    },
    addBtnText: { fontWeight: '800' as const, fontSize: 14 },
    empty: {
      color: c.textMuted,
      textAlign: 'center' as const,
      marginTop: 8,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row' as const,
      alignItems: 'flex-start' as const,
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { color: c.text, fontWeight: '700' as const, fontSize: 15 },
    meta: { color: c.textMuted, fontSize: 12 },
    link: { fontSize: 13, fontWeight: '600' as const, marginTop: 2 },
  };
}
