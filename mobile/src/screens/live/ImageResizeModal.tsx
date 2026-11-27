import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { haptic } from '../../ui/haptics';
import { emitToast } from '../../ui/toastBus';

export type ResizedImage = {
  uri: string;
  width: number;
  height: number;
};

const WIDTH_PRESETS = [
  { key: 'original', label: 'Original', width: null as number | null },
  { key: '1920', label: '1920', width: 1920 },
  { key: '1080', label: '1080', width: 1080 },
  { key: '720', label: '720', width: 720 },
] as const;

/**
 * Pick an export width for a photo. Long edge is capped; aspect is kept.
 */
export function ImageResizeModal({
  uri,
  width,
  height,
  onCancel,
  onDone,
}: {
  uri: string | null;
  width?: number | null;
  height?: number | null;
  onCancel: () => void;
  onDone: (result: ResizedImage) => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [preset, setPreset] = useState<(typeof WIDTH_PRESETS)[number]['key']>(
    '1080',
  );
  const [busy, setBusy] = useState(false);

  const srcW = width && width > 0 ? width : 0;
  const srcH = height && height > 0 ? height : 0;

  useEffect(() => {
    if (!uri) return;
    // Prefer 1080 when the source is larger; otherwise keep Original.
    setPreset(srcW > 1080 ? '1080' : 'original');
  }, [uri, srcW]);

  const chosen = WIDTH_PRESETS.find((p) => p.key === preset) ?? WIDTH_PRESETS[0];
  const targetW =
    chosen.width == null || srcW <= 0
      ? srcW
      : Math.min(chosen.width, srcW);

  const apply = async () => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      if (!chosen.width || srcW <= 0 || targetW >= srcW) {
        onDone({ uri, width: srcW || 1000, height: srcH || 1000 });
        return;
      }
      const out = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: targetW } }],
        {
          compress: 0.92,
          format: ImageManipulator.SaveFormat.JPEG,
        },
      );
      haptic('success');
      onDone({ uri: out.uri, width: out.width, height: out.height });
    } catch (err) {
      console.warn('resize failed:', err);
      haptic('error');
      emitToast('Could not resize that photo — saving the original');
      onDone({ uri, width: srcW || 1000, height: srcH || 1000 });
    } finally {
      setBusy(false);
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
            <Image
              source={{ uri }}
              style={styles.preview}
              resizeMode="contain"
              accessibilityLabel="Image to resize"
            />
          ) : null}
        </View>

        <View style={styles.sheet}>
          <Text style={styles.heading}>Resize Image</Text>
          <Text style={styles.sub}>
            {srcW > 0
              ? `Source ${srcW}×${srcH} · export width ${targetW || srcW}px`
              : 'Pick an export width'}
          </Text>

          <View style={styles.presetRow}>
            {WIDTH_PRESETS.map((p) => {
              const on = p.key === preset;
              const disabled =
                p.width != null && srcW > 0 && p.width >= srcW && p.key !== 'original';
              return (
                <Pressable
                  key={p.key}
                  style={[
                    styles.preset,
                    on && styles.presetOn,
                    disabled && styles.presetDisabled,
                  ]}
                  onPress={() => {
                    if (disabled) return;
                    haptic('selection');
                    setPreset(p.key);
                  }}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on, disabled }}
                  accessibilityLabel={`Resize ${p.label}`}
                >
                  <Text style={[styles.presetText, on && styles.presetTextOn]}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
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
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Save resized image"
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
      padding: 16,
    },
    preview: { width: '100%' as const, height: '100%' as const },
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
    presetDisabled: { opacity: 0.35 },
    presetText: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '700' as const,
    },
    presetTextOn: { color: c.chromeInk },
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
