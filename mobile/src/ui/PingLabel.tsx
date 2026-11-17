import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { pingColor, useServerPing } from '../perf/serverPing';

/**
 * Inline "(42ms)" next to the org name — live server round-trip, refreshed
 * every 3 s. Renders nothing until the first sample so headers don't jump.
 */
export function PingLabel({ style }: { style?: TextStyle }) {
  const { ms, failed } = useServerPing();
  if (ms === null && !failed) return null;
  const color = pingColor(ms, failed);
  return (
    <Text style={[styles.label, { color }, style]} accessibilityLabel="Server ping">
      {' '}({ms === null ? '--' : `${ms}ms`})
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
