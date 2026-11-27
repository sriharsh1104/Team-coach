import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { haptic } from '../../ui/haptics';
import { emitToast } from '../../ui/toastBus';
import { compressVideoAtMaxSize } from '../../media/compressVideoEdit';

export type CompressedVideo = {
  uri: string;
};

const PRESETS = [
  { key: '1080', label: '1080', maxSize: 1080 },
  { key: '720', label: '720', maxSize: 720 },
  { key: '480', label: '480', maxSize: 480 },
] as const;

/**
 * Shrink a clip for Discord / chat upload using react-native-compressor.
 */
export function VideoCompressModal({
  uri,
  onCancel,
  onDone,
}: {
  uri: string | null;
  onCancel: () => void;
  onDone: (result: CompressedVideo) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]['key']>('720');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (uri) {
      setPreset('720');
      setBusy(false);
      setProgress(null);
    }
  }, [uri]);

  const apply = async () => {
    if (!uri || busy) return;
    const chosen = PRESETS.find((p) => p.key === preset) ?? PRESETS[1];
    setBusy(true);
    setProgress(0);
    try {
      const out = await compressVideoAtMaxSize(uri, chosen.maxSize, (p) => {
        setProgress(p);
      });
      if (!out) {
        emitToast('Could not compress that video — is the compressor linked?');
        return;
      }
      haptic('success');
      onDone({ uri: out });
    } catch (err) {
      console.warn('video compress failed:', err);
      haptic('error');
      emitToast('Could not compress that video');
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

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
              source={{ uri }}
              style={styles.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              useNativeControls
              isLooping={false}
            />
          ) : null}
        </View>

        <View style={styles.sheet}>
          <Text style={styles.heading}>Compress Video</Text>
          <Text style={styles.sub}>
            Cap the long edge for a smaller file. 720 is a good default for
            chat.
          </Text>

          <View style={styles.presetRow}>
            {PRESETS.map((p) => {
              const on = p.key === preset;
              return (
                <Pressable
                  key={p.key}
                  style={[styles.preset, on && styles.presetOn]}
                  onPress={() => {
                    haptic('selection');
                    setPreset(p.key);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Compress ${p.label}`}
                >
                  <Text style={[styles.presetText, on && styles.presetTextOn]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {progress != null ? (
            <Text style={styles.progress}>
              Compressing… {Math.round(progress * 100)}%
            </Text>
          ) : null}

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
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Save compressed video"
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
    presetRow: { flexDirection: 'row' as const, gap: 8 },
    preset: {
      flex: 1,
      height: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    presetOn: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    presetText: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '700' as const,
    },
    presetTextOn: { color: c.chromeInk },
    progress: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600' as const,
    },
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
