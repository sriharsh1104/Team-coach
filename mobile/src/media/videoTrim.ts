import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type NativeVideoTrim = {
  isAvailable: () => boolean;
  trim: (
    uri: string,
    startMs: number,
    endMs: number,
  ) => Promise<{ uri: string; durationMs: number }>;
};

function loadNative(): NativeVideoTrim | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<NativeVideoTrim>('VideoTrim');
  } catch {
    return null;
  }
}

const native = loadNative();

export function isVideoTrimAvailable(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Trim `[startMs, endMs]` into a new cache file. Android may include a short
 * lead-in before `startMs` so the cut lands on a keyframe.
 */
export async function trimVideoNative(
  uri: string,
  startMs: number,
  endMs: number,
): Promise<{ uri: string; durationMs: number } | null> {
  if (!native) return null;
  try {
    if (!native.isAvailable()) return null;
    return await native.trim(uri, startMs, endMs);
  } catch (err) {
    console.warn('video trim failed:', err);
    return null;
  }
}
