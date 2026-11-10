import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type StopEvent = { uri?: string | null };

type NativeScreenRecorder = {
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  isRecording: () => boolean;
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
