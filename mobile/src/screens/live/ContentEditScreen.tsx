import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Screen } from '../../brand/Screen';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon } from '../../ui/AppIcon';
import { SoftPressable } from '../../ui/SoftPressable';
import { emitToast } from '../../ui/toastBus';
import {
  CroppedImage,
  ImageCropModal,
} from '../chat/ImageCropModal';

type CropShot = {
  uri: string;
  width?: number;
  height?: number;
};

/**
 * Streaming & Content Tools → Editing.
 * First slice: pick a photo or video and crop it. More tools later.
 */
export function ContentEditScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);
  const [cropShot, setCropShot] = useState<CropShot | null>(null);
  const [preview, setPreview] = useState<CroppedImage | null>(null);

  const pickImage = async () => {
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
      setCropShot({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
      });
    } catch {
      emitToast('Could not open the photo picker');
    } finally {
      setBusy(false);
    }
  };

  const pickVideo = async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        emitToast('Photo library permission is required');
        return;
      }
      // System trim/crop when the OS supports it — full in-app video
      // timeline editor comes later.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        videoMaxDuration: 180,
        quality: 1,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      const saved = await saveToGallery(asset.uri);
      emitToast(
        saved
          ? 'Cropped video saved to your gallery'
          : 'Video ready — could not save to gallery',
      );
    } catch {
      emitToast('Could not open the video picker');
    } finally {
      setBusy(false);
    }
  };

  const onCropDone = async (result: CroppedImage) => {
    setCropShot(null);
    setPreview(result);
    const saved = await saveToGallery(result.uri);
    emitToast(
      saved
        ? 'Cropped image saved to your gallery'
        : 'Cropped — could not save to gallery',
    );
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.title}>Editing</Text>
        <Text style={styles.body}>
          Crop photos with the in-app frame, or trim a video with the system
          editor. More tools will land here later.
        </Text>

        <SoftPressable
          style={styles.card}
          onPress={() => void pickImage()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Crop an image"
        >
          <View style={styles.cardIcon}>
            <AppIcon name="images-outline" size={22} color={colors.chromeInk} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Crop image</Text>
            <Text style={styles.cardSub}>
              Free · 1:1 · 4:5 · 16:9 — drag corners, then save
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </SoftPressable>

        <SoftPressable
          style={styles.card}
          onPress={() => void pickVideo()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Crop a video"
        >
          <View style={styles.cardIcon}>
            <AppIcon name="videocam-outline" size={22} color={colors.chromeInk} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Crop video</Text>
            <Text style={styles.cardSub}>
              Uses the phone’s trim editor for now
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </SoftPressable>

        {busy ? (
          <ActivityIndicator color={colors.chrome} style={styles.spinner} />
        ) : null}

        {preview ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>Last crop</Text>
            <Image
              source={{ uri: preview.uri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel="Cropped preview"
            />
            <Pressable onPress={() => setPreview(null)} hitSlop={8}>
              <Text style={styles.clearPreview}>Clear preview</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <ImageCropModal
        uri={cropShot?.uri ?? null}
        width={cropShot?.width}
        height={cropShot?.height}
        doneLabel="Save"
        onCancel={() => setCropShot(null)}
        onDone={(result) => void onCropDone(result)}
      />
    </Screen>
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
      marginBottom: 8,
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
    clearPreview: {
      color: c.link,
      fontSize: 14,
      fontWeight: '600' as const,
      alignSelf: 'flex-start' as const,
    },
  };
}
