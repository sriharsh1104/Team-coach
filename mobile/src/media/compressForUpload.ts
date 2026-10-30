import { Platform } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import {
  compressImageNative,
  compressVideoNative,
  tryGetNativeFileSize,
} from './nativeCompressor';

export type UploadAsset = {
  uri: string;
  fileName: string;
  mimeType: string;
};

const IMAGE_MAX_EDGE = 1600;
/** WhatsApp-ish JPEG quality — sharp enough for chat/stats, much smaller files. */
const IMAGE_JPEG_QUALITY = 0.72;
/** Skip re-encode when the picker already gave us a tiny file. */
const IMAGE_SKIP_UNDER_BYTES = 350_000;
const VIDEO_SKIP_UNDER_BYTES = 4_000_000;

function isVideoMime(mime: string) {
  return mime.startsWith('video/');
}

function isImageMime(mime: string) {
  return mime.startsWith('image/') || mime === 'application/octet-stream';
}

function withJpgName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.jpg`;
}

async function tryGetSizeBytes(uri: string): Promise<number | null> {
  try {
    if (Platform.OS === 'web') {
      const blob = await fetch(uri).then((r) => r.blob());
      return blob.size;
    }
    return await tryGetNativeFileSize(uri);
  } catch {
    return null;
  }
}

/**
 * Resize + JPEG compress via Expo (works on native + web + Expo Go).
 * Long edge capped at IMAGE_MAX_EDGE so big camera shots shrink hard
 * without looking mushy in chat.
 */
async function compressImageWithManipulator(
  asset: UploadAsset,
  width?: number | null,
  height?: number | null,
): Promise<UploadAsset> {
  const actions: ImageManipulator.Action[] = [];
  const w = width ?? 0;
  const h = height ?? 0;
  const longEdge = Math.max(w, h);
  if (longEdge > IMAGE_MAX_EDGE) {
    if (w >= h && w > 0) {
      actions.push({ resize: { width: IMAGE_MAX_EDGE } });
    } else if (h > 0) {
      actions.push({ resize: { height: IMAGE_MAX_EDGE } });
    } else {
      actions.push({ resize: { width: IMAGE_MAX_EDGE } });
    }
  } else if (!w && !h) {
    // Unknown dimensions — still cap width; manipulator keeps aspect ratio.
    actions.push({ resize: { width: IMAGE_MAX_EDGE } });
  }

  const result = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: IMAGE_JPEG_QUALITY,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  return {
    uri: result.uri,
    fileName: withJpgName(asset.fileName),
    mimeType: 'image/jpeg',
  };
}

/**
 * WhatsApp-style shrink before upload: keep looking sharp, cut the bytes.
 * Images always get a JPEG pass (Expo manipulator, with native auto compress
 * preferred when available). Videos use native auto compress when the
 * compressor module is linked; otherwise the original file is uploaded.
 */
export async function compressForUpload(
  input: {
    uri: string;
    fileName?: string | null;
    mimeType?: string | null;
    width?: number | null;
    height?: number | null;
  },
): Promise<UploadAsset> {
  const mimeType = (input.mimeType ?? 'image/jpeg').toLowerCase();
  const fileName =
    input.fileName?.trim() ||
    (isVideoMime(mimeType) ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`);
  const asset: UploadAsset = {
    uri: input.uri,
    fileName,
    mimeType,
  };

  if (isVideoMime(mimeType)) {
    const size = await tryGetSizeBytes(asset.uri);
    if (size != null && size < VIDEO_SKIP_UNDER_BYTES) return asset;
    return (await compressVideoNative(asset)) ?? asset;
  }

  if (!isImageMime(mimeType)) return asset;

  const size = await tryGetSizeBytes(asset.uri);
  if (size != null && size < IMAGE_SKIP_UNDER_BYTES) {
    // Still normalize to JPEG if it's a huge PNG/HEIC that reported wrong size,
    // but for already-small JPEGs skip work.
    if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return asset;
  }

  const native = await compressImageNative(asset);
  if (native) return native;

  try {
    return await compressImageWithManipulator(
      asset,
      input.width,
      input.height,
    );
  } catch {
    return asset;
  }
}
