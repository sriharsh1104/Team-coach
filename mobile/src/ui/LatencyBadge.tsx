import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLatency } from '../perf/LatencyContext';

function msColor(ms: number): string {
  if (ms < 200) return '#22c55e'; // fast — green
  if (ms < 500) return '#f59e0b'; // medium — amber
  return '#ef4444';               // slow — red
}

/**
 * Tiny floating badge (top-right, below the navigation header) that shows
 * how long the last screen navigation took to complete, measured from route
 * change to all interactions finishing (InteractionManager.runAfterInteractions).
 */
export function LatencyBadge() {
  const { entry } = useLatency();
  const insets = useSafeAreaInsets();

  if (!entry) return null;

  const color = msColor(entry.ms);

  return (
    <View
      style={[styles.wrapper, { top: insets.top + 52 }]}
      pointerEvents="none"
    >
      <View style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.ms, { color }]}>{entry.ms}ms</Text>
        <Text style={styles.screen} numberOfLines={1}>
          {entry.screen}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    right: 8,
    zIndex: 9000,
    pointerEvents: 'none',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 20,
    paddingVertical: 4,
    paddingHorizontal: 8,
    // Subtle border so it's readable on both light and dark screens.
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  ms: {
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.2,
  },
  screen: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    maxWidth: 80,
  },
});
