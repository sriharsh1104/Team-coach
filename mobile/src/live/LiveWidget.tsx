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
  const { live, elapsedSec, stopLive } = useLive();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!live) return;
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
  }, [live, pulse]);

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
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
        <Text style={styles.liveLabel}>LIVE</Text>
        <Text style={[styles.timer, { color: colors.text }]}>{fmt(elapsedSec)}</Text>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <Pressable
          onPress={() => void stopLive()}
          hitSlop={10}
          accessibilityLabel="End live"
          style={({ pressed }) => [styles.stopBtn, pressed && styles.stopBtnPressed]}
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
    backgroundColor: '#ef4444',
  },
  liveLabel: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
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
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stopBtnPressed: {
    opacity: 0.6,
  },
  stopLabel: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '700',
  },
});
