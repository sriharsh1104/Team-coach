import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  Text,
  View,
} from 'react-native';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon } from '../../ui/AppIcon';
import { haptic } from '../../ui/haptics';
import { emitToast } from '../../ui/toastBus';
import {
  isVideoTrimAvailable,
  trimVideoNative,
} from '../../media/videoTrim';

export type TrimmedVideo = {
  uri: string;
  durationMs: number;
};

const MIN_CLIP_MS = 500;
const HANDLE = 22;

/**
 * In-app trim: scrub start/end on a timeline, preview the range, then
 * export via the native VideoTrim module (Android). Falls back with a toast
 * when the native module isn't linked yet.
 */
export function VideoTrimModal({
  uri,
  durationMs: durationHint,
  onCancel,
  onDone,
}: {
  uri: string | null;
  /** Milliseconds from the picker when known. */
  durationMs?: number | null;
  onCancel: () => void;
  onDone: (result: TrimmedVideo) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const videoRef = useRef<Video>(null);
  const [durationMs, setDurationMs] = useState(
    durationHint && durationHint > 0 ? durationHint : 0,
  );
  const [startMs, setStartMs] = useState(0);
  const [endMs, setEndMs] = useState(
    durationHint && durationHint > 0 ? durationHint : 0,
  );
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trackW, setTrackW] = useState(0);

  const startRef = useRef(startMs);
  const endRef = useRef(endMs);
  const durationRef = useRef(durationMs);
  const dragOriginMs = useRef(0);
  startRef.current = startMs;
  endRef.current = endMs;
  durationRef.current = durationMs;

  useEffect(() => {
    if (!uri) return;
    const d = durationHint && durationHint > 0 ? durationHint : 0;
    setDurationMs(d);
    setStartMs(0);
    setEndMs(d);
    setPlaying(false);
    setBusy(false);
  }, [uri, durationHint]);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.durationMillis && status.durationMillis > 0) {
      setDurationMs((prev) => {
        if (prev > 0) return prev;
        setEndMs(status.durationMillis!);
        return status.durationMillis!;
      });
    }
    if (
      status.isPlaying &&
      status.positionMillis != null &&
      status.positionMillis >= endRef.current
    ) {
      void videoRef.current?.setPositionAsync(startRef.current);
    }
    setPlaying(status.isPlaying);
  };

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    const status = await v.getStatusAsync();
    if (!status.isLoaded) return;
    if (status.isPlaying) {
      await v.pauseAsync();
      return;
    }
    const pos = status.positionMillis ?? 0;
    if (pos < startMs || pos >= endMs) {
      await v.setPositionAsync(startMs);
    }
    await v.playAsync();
  };

  const onTrackLayout = (e: LayoutChangeEvent) => {
    setTrackW(e.nativeEvent.layout.width);
  };

  const msToX = (ms: number) => {
    if (durationMs <= 0 || trackW <= 0) return 0;
    return (ms / durationMs) * trackW;
  };

  const startDrag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          haptic('selection');
          dragOriginMs.current = startRef.current;
        },
        onPanResponderMove: (_e, g) => {
          if (durationRef.current <= 0 || trackW <= 0) return;
          const deltaMs = (g.dx / trackW) * durationRef.current;
          const next = Math.round(dragOriginMs.current + deltaMs);
          const max = endRef.current - MIN_CLIP_MS;
          setStartMs(Math.min(Math.max(0, next), Math.max(0, max)));
        },
        onPanResponderRelease: () => {
          void videoRef.current?.setPositionAsync(startRef.current);
        },
      }),
    [trackW],
  );

  const endDrag = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          haptic('selection');
          dragOriginMs.current = endRef.current;
        },
        onPanResponderMove: (_e, g) => {
          if (durationRef.current <= 0 || trackW <= 0) return;
          const deltaMs = (g.dx / trackW) * durationRef.current;
          const next = Math.round(dragOriginMs.current + deltaMs);
          const min = startRef.current + MIN_CLIP_MS;
          const max = durationRef.current;
          setEndMs(Math.max(min, Math.min(next, max)));
        },
        onPanResponderRelease: () => {
          void videoRef.current?.setPositionAsync(startRef.current);
        },
      }),
    [trackW],
  );

  const apply = async () => {
    if (!uri || busy || durationMs <= 0) return;
    if (!isVideoTrimAvailable()) {
      emitToast('Video trim needs a fresh app build — rebuild the APK');
      return;
    }
    setBusy(true);
    try {
      await videoRef.current?.pauseAsync();
      const out = await trimVideoNative(uri, startMs, endMs);
      if (!out) {
        emitToast('Could not trim that video');
        return;
      }
      haptic('success');
      onDone(out);
    } finally {
      setBusy(false);
    }
  };

  const clipMs = Math.max(0, endMs - startMs);
  const startX = msToX(startMs);
  const endX = msToX(endMs);

  return (
    <Modal
      visible={!!uri}
      transparent={false}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View style={styles.stage}>
          {uri ? (
            <Video
              ref={videoRef}
              source={{ uri }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping={false}
              useNativeControls={false}
              onPlaybackStatusUpdate={onStatus}
            />
          ) : null}
        </View>

        <View style={styles.sheet}>
          <Text style={styles.heading}>Trim Video</Text>
          <Text style={styles.sub}>
            {durationMs > 0
              ? `${fmt(startMs)} → ${fmt(endMs)} · clip ${fmt(clipMs)}`
              : 'Loading duration…'}
          </Text>

          <View style={styles.trackWrap} onLayout={onTrackLayout}>
            <View style={styles.track} />
            {durationMs > 0 && trackW > 0 ? (
              <>
                <View
                  style={[
                    styles.selected,
                    { left: startX, width: Math.max(2, endX - startX) },
                  ]}
                  pointerEvents="none"
                />
                <View
                  style={[styles.handle, { left: startX - HANDLE / 2 }]}
                  {...startDrag.panHandlers}
                  accessibilityLabel="Trim start"
                >
                  <View style={styles.handleDot} />
                </View>
                <View
                  style={[styles.handle, { left: endX - HANDLE / 2 }]}
                  {...endDrag.panHandlers}
                  accessibilityLabel="Trim end"
                >
                  <View style={styles.handleDot} />
                </View>
              </>
            ) : null}
          </View>

          <View style={styles.toolRow}>
            <Pressable
              style={[styles.tool, { borderColor: colors.border }]}
              onPress={() => void togglePlay()}
              disabled={busy || durationMs <= 0}
              accessibilityRole="button"
              accessibilityLabel={playing ? 'Pause' : 'Play clip'}
            >
              <AppIcon
                name={playing ? 'pause' : 'play'}
                size={16}
                color={colors.textMuted}
              />
              <Text style={[styles.toolText, { color: colors.textMuted }]}>
                {playing ? 'Pause' : 'Play'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tool, { borderColor: colors.border }]}
              onPress={() => {
                haptic('selection');
                setStartMs(0);
                setEndMs(durationMs);
                void videoRef.current?.setPositionAsync(0);
              }}
              disabled={busy || durationMs <= 0}
              accessibilityRole="button"
              accessibilityLabel="Reset trim"
            >
              <AppIcon name="refresh" size={16} color={colors.textMuted} />
              <Text style={[styles.toolText, { color: colors.textMuted }]}>
                Reset
              </Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={styles.ghost}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Discard"
            >
              <Text style={styles.ghostText}>Discard</Text>
            </Pressable>
            <Pressable
              style={styles.save}
              onPress={() => void apply()}
              disabled={busy || durationMs <= 0 || clipMs < MIN_CLIP_MS}
              accessibilityRole="button"
              accessibilityLabel="Save trimmed video"
            >
              {busy ? (
                <ActivityIndicator color={colors.chromeInk} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function makeStyles(c: ThemeColors) {
  return {
    root: { flex: 1, backgroundColor: '#000' },
    stage: {
      flex: 1,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      padding: 12,
    },
    video: { width: '100%' as const, height: '100%' as const },
    sheet: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 28,
      borderTopWidth: 1,
      borderTopColor: c.border,
      backgroundColor: c.bg,
      gap: 12,
    },
    heading: {
      color: c.text,
      fontSize: 18,
      fontWeight: '700' as const,
    },
    sub: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: -4,
    },
    trackWrap: {
      height: 36,
      justifyContent: 'center' as const,
      marginVertical: 4,
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    selected: {
      position: 'absolute' as const,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.chrome,
      top: 15,
    },
    handle: {
      position: 'absolute' as const,
      width: HANDLE,
      height: HANDLE,
      top: (36 - HANDLE) / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    handleDot: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: '#22c55e',
      borderWidth: 2,
      borderColor: '#fff',
    },
    toolRow: { flexDirection: 'row' as const, gap: 8 },
    tool: {
      flex: 1,
      height: 38,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 6,
    },
    toolText: { fontSize: 13, fontWeight: '700' as const },
    actions: { flexDirection: 'row' as const, gap: 10 },
    ghost: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    ghostText: {
      color: c.text,
      fontSize: 15,
      fontWeight: '600' as const,
    },
    save: {
      flex: 1,
      height: 46,
      borderRadius: 12,
      backgroundColor: c.chrome,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    saveText: {
      color: c.chromeInk,
      fontSize: 15,
      fontWeight: '700' as const,
    },
  };
}
