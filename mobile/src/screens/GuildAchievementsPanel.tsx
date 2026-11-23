import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, View } from 'react-native';
import * as orgApi from '../api/org';
import { GuildAchievement } from '../api/types';
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

function formatDisplayDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

type Props = {
  achievements: GuildAchievement[];
  canManage: boolean;
  onChanged: () => void;
};

/**
 * Guild trophy shelf — grand-final tournament finishes.
 * Visible to every guild member; only the org owner can add/remove.
 */
export function GuildAchievementsPanel({
  achievements,
  canManage,
  onChanged,
}: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(panelStyles);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [standing, setStanding] = useState('');
  const [points, setPoints] = useState('');
  const [link, setLink] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canSubmit =
    name.trim().length >= 2 &&
    /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) &&
    standing.trim().length >= 1 &&
    !saving;

  const onAdd = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const pts = points.trim() === '' ? undefined : Number(points.trim());
      if (pts != null && (!Number.isInteger(pts) || pts < 0)) {
        emitToast('Points must be a whole number ≥ 0');
        return;
      }
      await orgApi.createGuildAchievement({
        name: name.trim(),
        date: date.trim(),
        standing: standing.trim(),
        ...(pts != null ? { points: pts } : {}),
        ...(link.trim() ? { grandFinalLink: link.trim() } : {}),
      });
      setName('');
      setDate('');
      setStanding('');
      setPoints('');
      setLink('');
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
        Grand finals this guild played — standing and points for everyone to see.
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
          <TextInput
            style={[
              styles.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
            value={date}
            onChangeText={setDate}
            placeholder="Date (YYYY-MM-DD)"
            placeholderTextColor={colors.textDim}
            keyboardType="numbers-and-punctuation"
            accessibilityLabel="Grand final date"
          />
          <View style={staticStyles.row2}>
            <TextInput
              style={[
                styles.input,
                staticStyles.flex,
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
                staticStyles.points,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                },
              ]}
              value={points}
              onChangeText={(t) => setPoints(t.replace(/\D/g, ''))}
              placeholder="Points"
              placeholderTextColor={colors.textDim}
              keyboardType="number-pad"
              accessibilityLabel="Points, optional"
            />
          </View>
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
        achievements.map((item) => (
          <View key={item.id} style={[styles.row, { borderBottomColor: colors.border }]}>
            <View style={staticStyles.rowMain}>
              <Text style={styles.name} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={styles.meta}>
                {formatDisplayDate(item.date)} · {item.standing}
                {item.points != null ? ` · ${item.points} pts` : ''}
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
        ))
      )}
    </View>
  );
}

const staticStyles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  form: { gap: 8, marginBottom: 16 },
  row2: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1, minWidth: 0 },
  points: { width: 88 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
      alignItems: 'center' as const,
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    name: { color: c.text, fontWeight: '700' as const, fontSize: 15 },
    meta: { color: c.textMuted, fontSize: 12 },
    link: { fontSize: 13, fontWeight: '600' as const, marginTop: 2 },
  };
}
