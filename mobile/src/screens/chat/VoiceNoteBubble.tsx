import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { AppIcon } from '../../ui/AppIcon';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Playback bubble for a voice-note message: tap to play/pause, tiny progress bar.
 * Plays once then stops (never loops). */
export function VoiceNoteBubble({ uri, isMine }: { uri: string; isMine: boolean }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(bubbleStyles);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => undefined);
    };
  }, []);

  const stopAtStart = async () => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await sound.stopAsync();
      await sound.setPositionAsync(0);
    } catch {
      /* ignore */
    }
    setIsPlaying(false);
    setPositionMs(0);
  };

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setIsPlaying(status.isPlaying);
    setPositionMs(status.positionMillis);
    if (status.durationMillis) setDurationMs(status.durationMillis);
    if (status.didJustFinish) {
      void stopAtStart();
    }
  };

  const toggle = async () => {
    const sound = soundRef.current;
    if (sound) {
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await sound.pauseAsync();
        return;
      }
      // Finished or near end → restart once from the beginning.
      if (status.durationMillis && status.positionMillis >= status.durationMillis - 80) {
        await sound.setPositionAsync(0);
      }
      await sound.setIsLoopingAsync(false);
      await sound.playAsync();
      return;
    }
    setLoading(true);
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
      const { sound: s } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, isLooping: false },
      );
      soundRef.current = s;
      s.setOnPlaybackStatusUpdate(onStatus);
    } catch {
      /* no-op — tapping again will retry */
    } finally {
      setLoading(false);
    }
  };

  const progress = durationMs ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <Pressable
      style={styles.row}
      onPress={() => void toggle()}
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause voice note' : 'Play voice note'}
    >
      <View style={[styles.playBtn, isMine && styles.playBtnMine]}>
        <AppIcon
          name={isPlaying ? 'pause' : 'play'}
          size={16}
          color={isMine ? colors.chromeInk : colors.icon}
        />
      </View>
      <View style={staticStyles.track}>
        <View style={staticStyles.trackBg} />
        <View style={[staticStyles.trackFill, { width: `${progress * 100}%` }, isMine && styles.trackFillMine]} />
      </View>
      <Text style={styles.time}>{loading ? '…' : formatMs(durationMs ? (isPlaying || positionMs > 0 ? positionMs : durationMs) : positionMs)}</Text>
    </Pressable>
  );
}

const staticStyles = StyleSheet.create({
  track: { flex: 1, height: 3, borderRadius: 2, justifyContent: 'center', marginHorizontal: 8 },
  trackBg: { position: 'absolute', left: 0, right: 0, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)' },
  trackFill: { height: 3, borderRadius: 2, backgroundColor: '#fff' },
});

function bubbleStyles(c: ThemeColors) {
  return {
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, minWidth: 180, paddingVertical: 4 },
    playBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.surface,
    },
    playBtnMine: { backgroundColor: c.chrome },
    trackFillMine: { backgroundColor: c.chromeInk },
    time: { color: c.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] as any, minWidth: 32, textAlign: 'right' as const },
  };
}
