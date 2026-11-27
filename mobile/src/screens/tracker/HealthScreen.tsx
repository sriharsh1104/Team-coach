import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getHealthToday,
  HealthToday,
  localDay,
  upsertHealthDay,
} from '../../api/tracker';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { SoftPressable } from '../../ui/SoftPressable';
import { emitToast } from '../../ui/toastBus';
import {
  isPhoneStepCounterAvailable,
  readPhoneTodaySteps,
  requestActivityRecognition,
} from '../../tracker/phoneSteps';

function ProgressBar({
  value,
  max,
  color,
  track,
}: {
  value: number;
  max: number;
  color: string;
  track: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <View style={[barStyles.barTrack, { backgroundColor: track }]}>
      <View
        style={[
          barStyles.barFill,
          { width: `${Math.round(pct * 100)}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

/** Personal Health tracker — phone step sensor only. */
export function HealthScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [data, setData] = useState<HealthToday | null>(null);
  const [phoneOk, setPhoneOk] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [enablingPhone, setEnablingPhone] = useState(false);

  const refresh = useCallback(async () => {
    const day = localDay();
    let steps: number | null = null;

    const phoneSteps = await readPhoneTodaySteps();
    if (phoneSteps != null) {
      steps = phoneSteps;
      setPhoneOk(true);
    } else {
      setPhoneOk(false);
    }

    try {
      let today: HealthToday;
      if (steps != null) {
        setSyncing(true);
        today = await upsertHealthDay({
          day,
          steps,
          source: 'phone',
        });
      } else {
        today = await getHealthToday(day);
      }
      setData(today);
    } catch {
      emitToast('Could not load health data');
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const enablePhoneSteps = async () => {
    if (!isPhoneStepCounterAvailable()) {
      emitToast('This phone has no step sensor');
      return;
    }
    setEnablingPhone(true);
    try {
      const granted = await requestActivityRecognition();
      if (!granted) {
        emitToast('Allow Physical activity / Steps to read today’s count');
        return;
      }
      const n = await readPhoneTodaySteps();
      if (n == null) {
        emitToast('Could not read steps yet — walk a bit and pull to refresh');
        return;
      }
      emitToast(`Phone steps connected · ${n.toLocaleString()} today`);
      setLoading(true);
      await refresh();
    } finally {
      setEnablingPhone(false);
    }
  };

  if (loading && !data) {
    return (
      <Screen padBottom={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  const steps = data?.steps ?? 0;
  const stepGoal = data?.stepGoal ?? 10000;
  const stepsLeft = data?.stepsRemaining ?? Math.max(0, stepGoal - steps);

  return (
    <Screen padBottom={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.chrome}
          />
        }
      >
        {!phoneOk ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Read Phone Steps</Text>
            <Text style={styles.bannerBody}>
              Sacred phone ke apne step sensor se aaj ka count padhega. Sirf
              Physical activity / Steps permission allow karo.
            </Text>
            <SoftPressable
              style={[styles.bannerBtn, enablingPhone && styles.btnDisabled]}
              onPress={() => void enablePhoneSteps()}
              disabled={enablingPhone}
            >
              <Text style={styles.bannerBtnText}>
                {enablingPhone ? 'Enabling…' : 'Enable Phone Steps'}
              </Text>
            </SoftPressable>
          </View>
        ) : (
          <View style={styles.readyPill}>
            <Text style={styles.readyText}>
              Synced from phone step sensor
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Steps Today</Text>
          <Text style={styles.cardValue}>{steps.toLocaleString()}</Text>
          <Text style={styles.cardMeta}>
            Goal {stepGoal.toLocaleString()} · {stepsLeft.toLocaleString()} left
          </Text>
          <ProgressBar
            value={steps}
            max={stepGoal}
            color={colors.chrome}
            track={colors.border}
          />
        </View>

        <Pressable onPress={onRefresh} disabled={syncing}>
          <Text style={styles.syncLine}>
            {syncing
              ? 'Syncing…'
              : 'Pull to refresh · reads phone steps & updates your account'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const barStyles = StyleSheet.create({
  barTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 10,
  },
  barFill: {
    height: '100%',
    borderRadius: 999,
  },
});

function makeStyles(c: ThemeColors) {
  return {
    center: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    content: {
      padding: 16,
      paddingBottom: 32,
      gap: 12,
    },
    banner: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 14,
      gap: 10,
    },
    bannerTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700' as const,
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
    },
    bannerBtnText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 14,
    },
    btnDisabled: { opacity: 0.6 },
    readyPill: {
      alignSelf: 'flex-start' as const,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    readyText: {
      color: c.textMuted,
      fontSize: 12,
      fontWeight: '600' as const,
    },
    card: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 16,
    },
    cardLabel: {
      color: c.textDim,
      fontSize: 12,
      fontWeight: '700' as const,
      letterSpacing: 0.4,
      textTransform: 'uppercase' as const,
    },
    cardValue: {
      color: c.text,
      fontSize: 36,
      fontWeight: '800' as const,
      marginTop: 4,
      letterSpacing: -0.8,
    },
    cardMeta: {
      color: c.textMuted,
      fontSize: 13,
      marginTop: 2,
    },
    syncLine: {
      color: c.textDim,
      fontSize: 12,
      textAlign: 'center' as const,
      marginTop: 4,
    },
  };
}
