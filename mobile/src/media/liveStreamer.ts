import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativeLiveStreamer = {
  start: (rtmpUrl: string, streamKey: string) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  isLive: () => boolean;
  isPaused: () => boolean;
  addListener: (
    event: 'onStarted' | 'onStopped' | 'onError' | 'onPaused',
    listener: (event: {
      message?: string;
      code?: string;
      error?: string;
      paused?: boolean;
    }) => void,
  ) => { remove: () => void };
};

export type LiveStartResult = 'started' | 'unavailable' | 'unsupported';

function loadNative(): NativeLiveStreamer | null {
  try {
    return requireOptionalNativeModule<NativeLiveStreamer>('LiveStreamer');
  } catch {
    return null;
  }
}

const native = loadNative();

/** Android screen capture keeps streaming after this app goes to the background. */
export function startLiveStream(options: {
  rtmpUrl: string;
  streamKey: string;
}): Promise<LiveStartResult> | LiveStartResult {
  if (Platform.OS !== 'android') return 'unsupported';
  if (!native) return 'unavailable';
  if (native.isLive()) return 'started';
  return native
    .start(options.rtmpUrl, options.streamKey)
    .then(() => 'started' as const);
}

export function stopLiveStream(): Promise<void> {
  if (!native) return Promise.resolve();
  return native.stop();
}

export function pauseLiveStream(): Promise<void> {
  if (!native?.pause) return Promise.resolve();
  return native.pause();
}

export function resumeLiveStream(): Promise<void> {
  if (!native?.resume) return Promise.resolve();
  return native.resume();
}

export function isLiveStreaming(): boolean {
  return !!native?.isLive();
}

export function isLivePaused(): boolean {
  return !!native?.isPaused?.();
}

export function addLiveStartedListener(listener: () => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onStarted', () => listener());
  return () => sub.remove();
}

export function addLiveStoppedListener(
  listener: (error?: string | null) => void,
): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onStopped', (event) => {
    listener(event?.error ?? null);
  });
  return () => sub.remove();
}

export function addLiveErrorListener(listener: (message: string) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onError', (event) => {
    listener(event?.message || event?.error || 'Live stream error');
  });
  return () => sub.remove();
}

export function addLivePausedListener(
  listener: (paused: boolean) => void,
): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onPaused', (event) => {
    listener(!!event?.paused);
  });
  return () => sub.remove();
}
