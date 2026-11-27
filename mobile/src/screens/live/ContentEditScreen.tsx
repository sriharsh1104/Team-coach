import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon, AppIconName } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { emitToast } from '../../ui/toastBus';
import {
  CroppedImage,
  ImageCropModal,
} from '../chat/ImageCropModal';
import {
  ImageResizeModal,
  ResizedImage,
} from './ImageResizeModal';
import {
  CompressedVideo,
  VideoCompressModal,
} from './VideoCompressModal';
import { TrimmedVideo, VideoTrimModal } from './VideoTrimModal';

type Shot = {
  uri: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

type Preview =
  | { kind: 'image'; uri: string; width: number; height: number }
  | { kind: 'video'; uri: string; label: string };

/**
 * Streaming & Content Tools → Editing.
 * Images: crop / flip / rotate / resize.
 * Video: in-app trim + compress (native module / compressor).
 */
export function ContentEditScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [cropShot, setCropShot] = useState<Shot | null>(null);
  const [resizeShot, setResizeShot] = useState<Shot | null>(null);
  const [trimShot, setTrimShot] = useState<Shot | null>(null);
  const [compressShot, setCompressShot] = useState<Shot | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const pickImage = async (mode: 'crop' | 'resize') => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        emitToast('Photo library permission is required');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const shot: Shot = {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      };
      if (mode === 'crop') setCropShot(shot);
      else setResizeShot(shot);
    } catch {
      emitToast('Could not open the photo picker');
    } finally {
      setBusy(false);
    }
  };

  const pickVideo = async (mode: 'trim' | 'compress') => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        emitToast('Photo library permission is required');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const shot: Shot = {
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        // expo-image-picker documents duration in seconds.
        durationMs:
          typeof asset.duration === 'number' && asset.duration > 0
            ? Math.round(asset.duration * 1000)
            : undefined,
      };
      if (mode === 'trim') setTrimShot(shot);
      else setCompressShot(shot);
    } catch {
      emitToast('Could not open the video picker');
    } finally {
      setBusy(false);
    }
  };

  const finishImage = async (
    result: CroppedImage | ResizedImage,
    label: string,
  ) => {
    setCropShot(null);
    setResizeShot(null);
    setPreview({
      kind: 'image',
      uri: result.uri,
      width: result.width,
      height: result.height,
    });
    const saved = await saveToGallery(result.uri);
    emitToast(
      saved
        ? `${label} saved to your gallery`
        : `${label} ready — could not save to gallery`,
    );
  };

  const finishVideo = async (
    result: TrimmedVideo | CompressedVideo,
    label: string,
  ) => {
    setTrimShot(null);
    setCompressShot(null);
    setPreview({ kind: 'video', uri: result.uri, label });
    const saved = await saveToGallery(result.uri);
    emitToast(
      saved
        ? `${label} saved to your gallery`
        : `${label} ready — could not save to gallery`,
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Editing</Text>
        <Text style={styles.body}>
          Crop, flip, rotate, and resize photos. Trim and compress videos
          in-app.
        </Text>

        <Text style={styles.section}>Images</Text>

        <ToolCard
          icon="images-outline"
          title="Crop & Adjust"
          subtitle="Free · 1:1 · 4:5 · 9:16 · 4:3 · 16:9 — rotate & flip"
          onPress={() => void pickImage('crop')}
          disabled={busy}
          colors={colors}
          styles={styles}
        />

        <ToolCard
          icon="expand"
          title="Resize Image"
          subtitle="Cap export width at 1920 · 1080 · 720"
          onPress={() => void pickImage('resize')}
          disabled={busy}
          colors={colors}
          styles={styles}
        />

        <Text style={styles.section}>Video</Text>

        <ToolCard
          icon="videocam-outline"
          title="Trim Video"
          subtitle="Drag start & end, preview the clip, then save"
          onPress={() => void pickVideo('trim')}
          disabled={busy}
          colors={colors}
          styles={styles}
        />

        <ToolCard
          icon="contract"
          title="Compress Video"
          subtitle="Cap long edge at 1080 · 720 · 480 for smaller files"
          onPress={() => void pickVideo('compress')}
          disabled={busy}
          colors={colors}
          styles={styles}
        />

        {busy ? (
          <ActivityIndicator color={colors.chrome} style={styles.spinner} />
        ) : null}

        {preview?.kind === 'image' ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Last Edit</Text>
            <Image
              source={{ uri: preview.uri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel="Edited preview"
            />
            <Text style={styles.previewMeta}>
              {preview.width}×{preview.height}
            </Text>
            <Pressable onPress={() => setPreview(null)} hitSlop={8}>
              <Text style={styles.clearPreview}>Clear Preview</Text>
            </Pressable>
          </View>
        ) : null}

        {preview?.kind === 'video' ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Last Edit</Text>
            <Video
              source={{ uri: preview.uri }}
              style={styles.previewImage}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay={false}
            />
            <Text style={styles.previewMeta}>{preview.label}</Text>
            <Pressable onPress={() => setPreview(null)} hitSlop={8}>
              <Text style={styles.clearPreview}>Clear Preview</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <ImageCropModal
        uri={cropShot?.uri ?? null}
        width={cropShot?.width}
        height={cropShot?.height}
        doneLabel="Save"
        failToast="Could not crop that photo — saving the original."
        onCancel={() => setCropShot(null)}
        onDone={(result) => void finishImage(result, 'Edited image')}
      />

      <ImageResizeModal
        uri={resizeShot?.uri ?? null}
        width={resizeShot?.width}
        height={resizeShot?.height}
        onCancel={() => setResizeShot(null)}
        onDone={(result) => void finishImage(result, 'Resized image')}
      />

      <VideoTrimModal
        uri={trimShot?.uri ?? null}
        durationMs={trimShot?.durationMs}
        onCancel={() => setTrimShot(null)}
        onDone={(result) => void finishVideo(result, 'Trimmed video')}
      />

      <VideoCompressModal
        uri={compressShot?.uri ?? null}
        onCancel={() => setCompressShot(null)}
        onDone={(result) => void finishVideo(result, 'Compressed video')}
      />
    </Screen>
  );
}

function ToolCard({
  icon,
  title,
  subtitle,
  onPress,
  disabled,
  colors,
  styles,
}: {
  icon: AppIconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  disabled: boolean;
  colors: ThemeColors;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <SoftPressable
      style={styles.card}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.cardIcon}>
        <AppIcon name={icon} size={22} color={colors.chromeInk} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSub}>{subtitle}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </SoftPressable>
  );
}

async function saveToGallery(uri: string): Promise<boolean> {
  try {
    const perm = await MediaLibrary.requestPermissionsAsync();
    if (!perm.granted) return false;
    await MediaLibrary.saveToLibraryAsync(uri);
    return true;
  } catch {
    return false;
  }
}

function makeStyles(c: ThemeColors) {
  return {
    wrap: { padding: 20, paddingBottom: 40, gap: 12 },
    title: {
      color: c.text,
      fontSize: 28,
      fontWeight: '700' as const,
      letterSpacing: -0.4,
    },
    body: {
      color: c.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 4,
    },
    section: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      marginTop: 8,
      marginBottom: -2,
    },
    card: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    cardIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.chrome,
    },
    cardBody: { flex: 1, minWidth: 0, gap: 2 },
    cardTitle: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700' as const,
    },
    cardSub: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    chevron: {
      color: c.textDim,
      fontSize: 24,
      fontWeight: '300' as const,
    },
    spinner: { marginTop: 8 },
    previewCard: {
      marginTop: 8,
      gap: 10,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    previewLabel: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
    },
    previewImage: {
      width: '100%' as const,
      height: 220,
      borderRadius: 10,
      backgroundColor: c.bg,
    },
    previewMeta: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600' as const,
    },
    clearPreview: {
      color: c.link,
      fontSize: 14,
      fontWeight: '600' as const,
      alignSelf: 'flex-start' as const,
    },
  };
}
