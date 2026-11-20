import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type StopEvent = { uri?: string | null };

type NativeScreenRecorder = {
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  isRecording: () => boolean;
  saveToGallery: () => Promise<string>;
  discard: () => Promise<void>;
  addListener: (
    event: 'onStopped',
    listener: (event: StopEvent) => void,
  ) => { remove: () => void };
};

export type ScreenRecordStart = 'started' | 'unavailable' | 'unsupported';

function loadNative(): NativeScreenRecorder | null {
  try {
    return requireOptionalNativeModule<NativeScreenRecorder>('ScreenRecorder');
  } catch {
    return null;
  }
}

const native = loadNative();

/** Android screen capture keeps running after this app goes to the background. */
export function startScreenRecording(): Promise<ScreenRecordStart> | ScreenRecordStart {
  if (Platform.OS !== 'android') return 'unsupported';
  if (!native) return 'unavailable';
  if (native.isRecording()) return 'started';
  return native.start().then(() => 'started' as const);
}

export function stopScreenRecording(): Promise<string | null> {
  if (!native) return Promise.resolve(null);
  return native.stop();
}

/**
 * A stopped recording stays in the app cache until the user decides.
 * Save copies it into the phone gallery (returns the gallery uri).
 */
export function saveRecordingToGallery(): Promise<string | null> {
  if (!native) return Promise.resolve(null);
  return native.saveToGallery();
}

export function discardRecording(): Promise<void> {
  if (!native) return Promise.resolve();
  return native.discard();
}

export function isScreenRecording(): boolean {
  return !!native?.isRecording();
}

export function addScreenRecordingStoppedListener(
  listener: (uri: string | null) => void,
): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onStopped', (event) => {
    listener(event?.uri ?? null);
  });
  return () => sub.remove();
}
