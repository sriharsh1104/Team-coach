import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppIcon } from '../ui/AppIcon';
import { useTheme } from '../theme/ThemeContext';
import { useRecording } from './RecordingContext';

/** Format seconds → HH:MM:SS */
function fmt(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Floating recording status pill — appears at the top of the screen whenever
 * a screen recording is active. Tap "Stop" to stop + auto-save to gallery.
 */
export function RecordingWidget() {
  const { recording, elapsedSec, stopRecording } = useRecording();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Pulsing red dot opacity
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!recording) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.2,
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
  }, [recording, pulse]);

  if (!recording) return null;

  return (
    <View
      style={[styles.wrapper, { top: insets.top + 10 }]}
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
        {/* Pulsing dot */}
        <Animated.View style={[styles.dot, { opacity: pulse }]} />

        {/* REC label */}
        <Text style={styles.recLabel}>REC</Text>

        {/* Elapsed timer */}
        <Text style={[styles.timer, { color: colors.text }]}>{fmt(elapsedSec)}</Text>

        {/* Divider */}
        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Stop button */}
        <Pressable
          onPress={stopRecording}
          hitSlop={10}
          accessibilityLabel="Stop recording"
          style={({ pressed }) => [styles.stopBtn, pressed && styles.stopBtnPressed]}
        >
          <AppIcon name="stop-circle" size={16} color="#e74c3c" />
          <Text style={styles.stopLabel}>Stop</Text>
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
    zIndex: 9999,
    // Pointer events only on the pill itself, not the transparent wrapper
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
    // Drop shadow for visibility
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
    backgroundColor: '#e74c3c',
  },
  recLabel: {
    color: '#e74c3c',
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
    color: '#e74c3c',
    fontSize: 13,
    fontWeight: '700',
  },
});
