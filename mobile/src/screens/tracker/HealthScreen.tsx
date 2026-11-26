import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
  getHealthConnectStatus,
  HealthConnectStatus,
  openHealthConnectInstallOrSettings,
  readTodayHealth,
  requestHealthPermissions,
} from '../../tracker/healthConnect';

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

/**
 * Personal Health tracker — pulls today's steps / heart-point proxy from
 * Health Connect (Android), syncs the sample to the account, and shows
 * remaining progress against daily goals.
 */
export function HealthScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [data, setData] = useState<HealthToday | null>(null);
  const [hcStatus, setHcStatus] = useState<HealthConnectStatus>('unavailable');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const day = localDay();
    const status = await getHealthConnectStatus();
    setHcStatus(status);

    let sample = null;
    if (status === 'ready') {
      sample = await readTodayHealth();
      if (sample == null) {
        const granted = await requestHealthPermissions();
        if (granted) sample = await readTodayHealth();
        else setHcStatus('needs_permission');
      }
    }

    try {
      let today: HealthToday;
      if (sample) {
        setSyncing(true);
        today = await upsertHealthDay({
          day,
          steps: sample.steps,
          heartPoints: sample.heartPoints ?? 0,
          source: sample.source,
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

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const connect = async () => {
    if (hcStatus === 'needs_install' || hcStatus === 'unavailable') {
      openHealthConnectInstallOrSettings();
      return;
    }
    const ok = await requestHealthPermissions();
    if (!ok) {
      emitToast('Health permission was not granted');
      openHealthConnectInstallOrSettings();
      return;
    }
    setLoading(true);
    await refresh();
  };

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  const steps = data?.steps ?? 0;
  const stepGoal = data?.stepGoal ?? 10000;
  const heart = data?.heartPoints ?? 0;
  const heartGoal = data?.heartGoal ?? 30;
  const stepsLeft = data?.stepsRemaining ?? Math.max(0, stepGoal - steps);
  const heartLeft = data?.heartRemaining ?? Math.max(0, heartGoal - heart);

  return (
    <Screen>
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
        {hcStatus !== 'ready' && hcStatus !== 'needs_permission' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Connect Health Data</Text>
            <Text style={styles.bannerBody}>
              {hcStatus === 'unsupported'
                ? 'Step tracking is available on Android with Health Connect.'
                : hcStatus === 'needs_install'
                  ? 'Install Health Connect to sync steps and heart points from your phone.'
                  : 'Health Connect is not available on this device.'}
            </Text>
            {hcStatus !== 'unsupported' ? (
              <SoftPressable style={styles.bannerBtn} onPress={connect}>
                <Text style={styles.bannerBtnText}>
                  {hcStatus === 'needs_install' ? 'Open Install' : 'Open Settings'}
                </Text>
              </SoftPressable>
            ) : null}
          </View>
        ) : null}

        {hcStatus === 'needs_permission' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Allow Step Access</Text>
            <Text style={styles.bannerBody}>
              Grant Health Connect permission so Sacred can read today&apos;s
              steps and activity.
            </Text>
            <SoftPressable style={styles.bannerBtn} onPress={connect}>
              <Text style={styles.bannerBtnText}>Grant Access</Text>
            </SoftPressable>
          </View>
        ) : null}

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

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Heart Points</Text>
          <Text style={styles.cardValue}>
            {data?.source ? heart.toLocaleString() : '—'}
          </Text>
          <Text style={styles.cardMeta}>
            Goal {heartGoal.toLocaleString()} · {heartLeft.toLocaleString()} left
          </Text>
          <ProgressBar
            value={heart}
            max={heartGoal}
            color={colors.link}
            track={colors.border}
          />
          <Text style={styles.hint}>
            Heart Points are estimated from active exercise minutes (moderate ≈
            1 / vigorous ≈ 2 per minute).
          </Text>
        </View>

        <Pressable onPress={onRefresh} disabled={syncing}>
          <Text style={styles.syncLine}>
            {syncing ? 'Syncing…' : 'Pull to refresh · synced to your account'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const barStyles = StyleSheet.create({
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 12,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
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
      paddingBottom: 40,
      gap: 14,
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
    card: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      padding: 16,
    },
    cardLabel: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600' as const,
      textTransform: 'capitalize' as const,
      marginBottom: 4,
    },
    cardValue: {
      color: c.text,
      fontSize: 36,
      fontWeight: '800' as const,
      letterSpacing: -0.5,
    },
    cardMeta: {
      color: c.textDim,
      fontSize: 14,
      marginTop: 4,
    },
    hint: {
      color: c.textDim,
      fontSize: 12,
      marginTop: 10,
      lineHeight: 17,
    },
    syncLine: {
      color: c.textDim,
      fontSize: 12,
      textAlign: 'center' as const,
      marginTop: 8,
    },
  };
}
