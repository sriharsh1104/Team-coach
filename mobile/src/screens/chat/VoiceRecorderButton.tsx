import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { AppIcon } from '../../ui/AppIcon';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';

export type RecordedVoiceNote = {
  uri: string;
  fileName: string;
  mimeType: string;
  durationMs: number;
};

// Mono, modest bitrate — a voice note doesn't need music-grade stereo audio,
// and this keeps a minute-long clip well under half a megabyte.
const VOICE_NOTE_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension: '.m4a',
    outputFormat: Audio.AndroidOutputFormat.MPEG_4,
    audioEncoder: Audio.AndroidAudioEncoder.AAC,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
    audioQuality: Audio.IOSAudioQuality.MEDIUM,
    sampleRate: 22050,
    numberOfChannels: 1,
    bitRate: 64000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

const MIN_DURATION_MS = 700; // shorter than this is almost certainly an accidental tap

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

type Props = {
  onRecorded: (note: RecordedVoiceNote) => void;
  disabled?: boolean;
};

/**
 * Tap the mic to start, then either tap ✕ to discard or tap send to attach
 * the recording as a voice note (reuses the same optimistic-upload pipeline
 * as photos/videos once onRecorded fires).
 */
export function VoiceRecorderButton({ onRecorded, disabled }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(recorderStyles);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
      // Unmounted mid-recording (navigated away) — don't leak the recorder.
      recording?.stopAndUnloadAsync().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    if (recording) return;
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow microphone access to record a voice note.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording: rec } = await Audio.Recording.createAsync(VOICE_NOTE_OPTIONS);
      if (!mountedRef.current) {
        await rec.stopAndUnloadAsync().catch(() => undefined);
        return;
      }
      setRecording(rec);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      timerRef.current = setInterval(() => {
        if (mountedRef.current) setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch {
      Alert.alert('Could not start recording', 'Try again in a moment.');
    }
  };

  const stop = async (send: boolean) => {
    const rec = recording;
    if (!rec) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const duration = Date.now() - startedAtRef.current;
    setRecording(null);
    setElapsedMs(0);
    try {
      await rec.stopAndUnloadAsync();
    } catch {
      /* already stopped */
    }
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);
    const uri = rec.getURI();
    if (send && uri && duration >= MIN_DURATION_MS) {
      onRecorded({ uri, fileName: `voice-${Date.now()}.m4a`, mimeType: 'audio/mp4', durationMs: duration });
    } else if (uri) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
    }
  };

  if (recording) {
    return (
      <View style={styles.activeRow}>
        <View style={styles.dot} />
        <Text style={styles.timer}>{formatElapsed(elapsedMs)}</Text>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => void stop(false)}
          accessibilityRole="button"
          accessibilityLabel="Discard recording"
          hitSlop={8}
        >
          <AppIcon name="close" size={18} color={colors.textMuted} />
        </Pressable>
        <Pressable
          style={styles.sendBtn}
          onPress={() => void stop(true)}
          accessibilityRole="button"
          accessibilityLabel="Send voice note"
          hitSlop={8}
        >
          <AppIcon name="send" size={18} color={colors.chromeInk} />
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.micBtn}
      disabled={disabled}
      onPress={() => void start()}
      accessibilityRole="button"
      accessibilityLabel="Record a voice note"
      hitSlop={8}
    >
      <AppIcon name="mic" size={20} color={colors.icon} />
    </Pressable>
  );
}

function recorderStyles(c: ThemeColors) {
  return {
    micBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    activeRow: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: c.surface,
    },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ef4444' },
    timer: { color: c.text, fontVariant: ['tabular-nums'] as any, fontSize: 13, minWidth: 34 },
    cancelBtn: { width: 32, height: 32, alignItems: 'center' as const, justifyContent: 'center' as const },
    sendBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.chrome,
    },
  };
}
