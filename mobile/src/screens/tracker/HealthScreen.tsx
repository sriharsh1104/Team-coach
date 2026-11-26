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
  const [connecting, setConnecting] = useState(false);

  const refresh = useCallback(async () => {
    const day = localDay();
    const status = await getHealthConnectStatus();
    setHcStatus(status);

    let sample = null;
    if (status === 'ready') {
      sample = await readTodayHealth();
      // Permission can be revoked in system settings between checks.
      if (sample == null) setHcStatus('needs_permission');
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

  // Returning from Health Connect's setup / permission UI — re-check grants.
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

  const connect = async () => {
    if (hcStatus === 'needs_install' || hcStatus === 'unavailable') {
      openHealthConnectInstallOrSettings();
      return;
    }
    setConnecting(true);
    try {
      const ok = await requestHealthPermissions();
      // Always re-read — the system may have granted while we were backgrounded.
      await refresh();
      const status = await getHealthConnectStatus();
      if (status === 'ready' || ok) {
        emitToast('Health Connect connected');
        return;
      }
      emitToast(
        'Steps abhi allow nahi hua. Agar “Connect a second app” dikha tha to Set up later dabao, phir Grant Access dobara — Sacred ko Steps tick karo.',
      );
    } finally {
      setConnecting(false);
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
  const heart = data?.heartPoints ?? 0;
  const heartGoal = data?.heartGoal ?? 30;
  const stepsLeft = data?.stepsRemaining ?? Math.max(0, stepGoal - steps);
  const heartLeft = data?.heartRemaining ?? Math.max(0, heartGoal - heart);
  const syncedFromPhone = data?.source === 'health_connect';

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
        {hcStatus !== 'ready' && hcStatus !== 'needs_permission' ? (
          <View style={styles.banner}>
            <Text style={styles.bannerTitle}>Connect Health Data</Text>
            <Text style={styles.bannerBody}>
              {hcStatus === 'unsupported'
                ? 'Step tracking is available on Android with Health Connect.'
                : hcStatus === 'needs_install'
                  ? 'Install Health Connect, then come back and grant Steps access so Sacred can update your daily count.'
                  : 'Health Connect is not available on this device.'}
            </Text>
            {hcStatus !== 'unsupported' ? (
              <SoftPressable
                style={styles.bannerBtn}
                onPress={connect}
                disabled={connecting}
              >
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
              Grant Access dabane ke baad agar “Connect a second app” (Fit /
              ChatGPT list) aaye to woh HC setup hai — Set up later dabao. Phir
              wapas yahan Grant Access — Sacred ke liye Steps (aur Exercise)
              allow karo. Fit list mein hona zaroori nahi.
            </Text>
            <SoftPressable
              style={[styles.bannerBtn, connecting && styles.btnDisabled]}
              onPress={connect}
              disabled={connecting}
            >
              <Text style={styles.bannerBtnText}>
                {connecting ? 'Connecting…' : 'Grant Access'}
              </Text>
            </SoftPressable>
            <SoftPressable
              style={styles.secondaryBtn}
              onPress={openHealthConnectInstallOrSettings}
              disabled={connecting}
            >
              <Text style={styles.secondaryBtnText}>Open Health Connect</Text>
            </SoftPressable>
          </View>
        ) : null}

        {hcStatus === 'ready' ? (
          <View style={styles.readyPill}>
            <Text style={styles.readyText}>
              {syncedFromPhone
                ? 'Synced from Health Connect'
                : 'Health Connect connected · pull to refresh'}
            </Text>
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
            {syncedFromPhone || heart > 0 ? heart.toLocaleString() : '—'}
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
            Estimated from Health Connect exercise sessions (moderate ≈ 1 /
            vigorous ≈ 2 points per minute).
          </Text>
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
    secondaryBtn: {
      alignSelf: 'flex-start' as const,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    secondaryBtnText: {
      color: c.link,
      fontWeight: '600' as const,
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
    hint: {
      color: c.textDim,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 10,
    },
    syncLine: {
      color: c.textDim,
      fontSize: 12,
      textAlign: 'center' as const,
      marginTop: 4,
    },
  };
}
