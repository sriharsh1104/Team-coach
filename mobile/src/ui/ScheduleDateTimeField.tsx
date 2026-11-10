import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Platform,
  StyleSheet,
  TextInput,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemeColors } from '../theme';
import { useThemedStyles } from '../theme/useThemedStyles';

function formatSchedule(date: Date) {
  return date.toLocaleString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toLocalDateInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function hour12Of(date: Date) {
  const h = date.getHours() % 12;
  return h === 0 ? 12 : h;
}

function periodOf(date: Date): 'AM' | 'PM' {
  return date.getHours() >= 12 ? 'PM' : 'AM';
}

/** Today's date/time, but forced to a PM hour — the default for a brand new
 * round/event, since games are typically scheduled in the evening and
 * "whatever the wall clock says right now" could land on AM. */
export function defaultEventTimeToPM(base: Date = new Date()): Date {
  const next = new Date(base);
  if (next.getHours() < 12) next.setHours(next.getHours() + 12);
  return next;
}

/**
 * Calendar date picker + an explicit hour/minute/AM-PM time control — the
 * time slot is deliberately separate from the date, with its own AM/PM
 * toggle, rather than relying on a platform's native time widget (whose
 * 12h/24h display and AM/PM handling varies by device locale).
 */
export function ScheduleDateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date;
  onChange: (next: Date) => void;
}) {
  const styles = useThemedStyles(scheduleFieldStyles);
  const [showDate, setShowDate] = useState(false);
  const [hourText, setHourText] = useState(String(hour12Of(value)));
  const [minuteText, setMinuteText] = useState(String(value.getMinutes()).padStart(2, '0'));

  const applyTime = (hour12: number, minute: number, period: 'AM' | 'PM') => {
    const next = new Date(value);
    let hours24 = hour12 % 12;
    if (period === 'PM') hours24 += 12;
    next.setHours(hours24, minute, 0, 0);
    onChange(next);
  };

  const onHourChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setHourText(digits);
    const parsed = parseInt(digits, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
      applyTime(parsed, value.getMinutes(), periodOf(value));
    }
  };

  const onMinuteChange = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 2);
    setMinuteText(digits);
    const parsed = parseInt(digits, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 59) {
      applyTime(hour12Of(value), parsed, periodOf(value));
    }
  };

  const onHourBlur = () => {
    const parsed = Math.min(12, Math.max(1, parseInt(hourText, 10) || 12));
    setHourText(String(parsed));
    applyTime(parsed, value.getMinutes(), periodOf(value));
  };

  const onMinuteBlur = () => {
    const parsed = Math.min(59, Math.max(0, parseInt(minuteText, 10) || 0));
    setMinuteText(String(parsed).padStart(2, '0'));
    applyTime(hour12Of(value), parsed, periodOf(value));
  };

  const setPeriod = (period: 'AM' | 'PM') => {
    applyTime(hour12Of(value), value.getMinutes(), period);
  };

  const dateChip =
    Platform.OS === 'web' ? (
      <TextInput
        // RN Web supports a native date calendar for this input type.
        // @ts-expect-error web-only input type
        type="date"
        style={[styles.chip, styles.webDateInput]}
        value={toLocalDateInputValue(value)}
        onChangeText={(text) => {
          const [y, m, d] = text.split('-').map(Number);
          if (!y || !m || !d) return;
          const next = new Date(value);
          next.setFullYear(y, m - 1, d);
          onChange(next);
        }}
      />
    ) : (
      <Pressable
        style={styles.chip}
        onPress={() => setShowDate(true)}
        accessibilityLabel={`${label} Date`}
      >
        <Text style={staticStyles.chipIcon}>📅</Text>
        <Text style={styles.chipText}>{value.toLocaleDateString()}</Text>
      </Pressable>
    );

  return (
    <View style={staticStyles.block}>
      <Text style={styles.label}>{label}</Text>

      <Text style={styles.subLabel}>Date</Text>
      {dateChip}
      {Platform.OS !== 'web' && showDate && (
        <DateTimePicker
          value={value}
          mode="date"
          display="calendar"
          onChange={(_e, date) => {
            setShowDate(false);
            if (!date) return;
            const next = new Date(value);
            next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            onChange(next);
          }}
        />
      )}

      <Text style={styles.subLabel}>Time</Text>
      <View style={staticStyles.timeRow}>
        <TextInput
          style={styles.timeInput}
          keyboardType="number-pad"
          maxLength={2}
          value={hourText}
          onChangeText={onHourChange}
          onBlur={onHourBlur}
          accessibilityLabel={`${label} Hour`}
        />
        <Text style={styles.timeColon}>:</Text>
        <TextInput
          style={styles.timeInput}
          keyboardType="number-pad"
          maxLength={2}
          value={minuteText}
          onChangeText={onMinuteChange}
          onBlur={onMinuteBlur}
          accessibilityLabel={`${label} Minute`}
        />
        <View style={styles.periodToggle}>
          {(['AM', 'PM'] as const).map((p) => (
            <Pressable
              key={p}
              style={[styles.periodOption, periodOf(value) === p && styles.periodOptionActive]}
              onPress={() => setPeriod(p)}
              accessibilityLabel={`${label} ${p}`}
            >
              <Text
                style={
                  periodOf(value) === p ? styles.periodTextActive : styles.periodText
                }
              >
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.hint}>{formatSchedule(value)}</Text>
    </View>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  block: { marginBottom: 12 },
  chipIcon: { fontSize: 14 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function scheduleFieldStyles(c: ThemeColors) {
  return {
    label: {
      color: c.text,
      fontWeight: '600' as const,
      marginBottom: 8,
      textTransform: 'capitalize' as const,
    },
    subLabel: { color: c.textMuted, fontSize: 12, marginBottom: 4 },
    hint: { color: c.textMuted, fontSize: 12, marginTop: 8 },
    chip: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 10,
      marginBottom: 10,
    },
    webDateInput: { color: c.text, fontSize: 15 },
    chipText: { color: c.text, fontWeight: '600' as const },
    timeInput: {
      width: 48,
      textAlign: 'center' as const,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 8,
      paddingVertical: 10,
      fontSize: 16,
      fontWeight: '700' as const,
      color: c.text,
    },
    timeColon: { color: c.text, fontWeight: '700' as const, fontSize: 16 },
    periodToggle: {
      flexDirection: 'row' as const,
      marginLeft: 8,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 8,
      overflow: 'hidden' as const,
    },
    periodOption: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: c.surface,
    },
    periodOptionActive: { backgroundColor: c.chrome },
    periodText: { color: c.text, fontWeight: '700' as const, fontSize: 13 },
    periodTextActive: { color: c.chromeInk, fontWeight: '700' as const, fontSize: 13 },
  };
}
