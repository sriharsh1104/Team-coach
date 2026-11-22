import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';
import { useTheme } from '../theme/ThemeContext';
import { useLive } from './LiveContext';

function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Floating LIVE status pill — appears while an RTMP stream is active.
 * Separate from RecordingWidget (REC).
 */
export function LiveWidget() {
  const { live, paused, elapsedSec, stopLive, pauseLive, resumeLive } = useLive();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!live || paused) {
      pulse.setValue(1);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.25,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [live, paused, pulse]);

  if (!live) return null;

  return (
    <View
      style={[styles.wrapper, { top: insets.top + 52 }]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.dot,
            { opacity: paused ? 1 : pulse, backgroundColor: paused ? '#f59e0b' : '#ef4444' },
          ]}
        />
        <Text style={[styles.liveLabel, paused && styles.pausedLabel]}>
          {paused ? 'PAUSED' : 'LIVE'}
        </Text>
        <Text style={[styles.timer, { color: colors.text }]}>{fmt(elapsedSec)}</Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => void (paused ? resumeLive() : pauseLive())}
          hitSlop={10}
          accessibilityLabel={paused ? 'Resume live' : 'Pause live'}
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
        >
          <AppIcon
            name={paused ? 'play' : 'pause'}
            size={15}
            color={colors.text}
          />
          <Text style={[styles.actionLabel, { color: colors.text }]}>
            {paused ? 'Resume' : 'Pause'}
          </Text>
        </Pressable>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => void stopLive()}
          hitSlop={10}
          accessibilityLabel="End live"
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
        >
          <AppIcon name="stop-circle" size={16} color="#ef4444" />
          <Text style={styles.stopLabel}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9998,
    pointerEvents: 'box-none',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  liveLabel: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  pausedLabel: {
    color: '#f59e0b',
  },
  timer: {
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 16,
    marginHorizontal: 2,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionPressed: {
    opacity: 0.6,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  stopLabel: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
