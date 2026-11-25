import React, { useEffect, useRef, useState } from 'react';
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
 * In-app LIVE chip — collapsed by default so it barely covers the screen.
 * Tap LIVE to expand Pause / Mute / Face / End on a second row so the
 * timer never gets squeezed off-screen. (Over Free Fire, the native
 * system bubble from LiveStreamService is used instead.)
 */
export function LiveWidget() {
  const {
    live,
    paused,
    muted,
    faceCam,
    elapsedSec,
    stopLive,
    pauseLive,
    resumeLive,
    toggleMute,
    toggleFaceCam,
  } = useLive();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pulse = useRef(new Animated.Value(1)).current;
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!live) setExpanded(false);
  }, [live]);

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
        <View style={styles.topRow}>
          <Pressable
            onPress={() => setExpanded((open) => !open)}
            hitSlop={8}
            accessibilityLabel={
              expanded ? 'Collapse live controls' : 'Expand live controls'
            }
            style={styles.liveTap}
          >
            <Animated.View
              style={[
                styles.dot,
                {
                  opacity: paused ? 1 : pulse,
                  backgroundColor: paused ? '#f59e0b' : '#ef4444',
                },
              ]}
            />
            <Text style={[styles.liveLabel, paused && styles.pausedLabel]}>
              {paused ? 'PAUSED' : 'LIVE'}
            </Text>
            <Text
              style={[styles.timer, { color: colors.text }]}
              accessibilityLabel={`Live for ${fmt(elapsedSec)}`}
            >
              {fmt(elapsedSec)}
            </Text>
            <AppIcon
              name={expanded ? 'contract' : 'expand'}
              size={14}
              color={colors.textMuted}
            />
          </Pressable>
        </View>

        {expanded ? (
          <View style={styles.actionsRow}>
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
              onPress={() => void toggleMute()}
              hitSlop={10}
              accessibilityLabel={muted ? 'Unmute stream' : 'Mute stream'}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            >
              <AppIcon
                name={muted ? 'mic-off' : 'mic'}
                size={15}
                color={muted ? '#f59e0b' : colors.text}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: muted ? '#f59e0b' : colors.text },
                ]}
              >
                {muted ? 'Unmute' : 'Mute'}
              </Text>
            </Pressable>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Pressable
              onPress={() => void toggleFaceCam()}
              hitSlop={10}
              accessibilityLabel={
                faceCam ? 'Hide face camera' : 'Show face camera'
              }
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionPressed]}
            >
              <AppIcon
                name="camera-outline"
                size={15}
                color={faceCam ? '#f59e0b' : colors.text}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: faceCam ? '#f59e0b' : colors.text },
                ]}
              >
                {faceCam ? 'Face off' : 'Face'}
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
        ) : null}
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
    flexDirection: 'column',
    alignItems: 'center',
    maxWidth: '94%',
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 6,
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
