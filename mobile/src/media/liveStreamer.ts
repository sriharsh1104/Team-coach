import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativeLiveStreamer = {
  /**
   * JSON array of `{ url, key }` — one shared screen capture to every
   * destination. `bannerUri` is the break card pause paints over the frame.
   */
  start: (destinationsJson: string, bannerUri: string) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  setFaceCam: (enabled: boolean) => Promise<void>;
  isLive: () => boolean;
  isPaused: () => boolean;
  isMuted: () => boolean;
  isFaceCam: () => boolean;
  addListener: (
    event:
      | 'onStarted'
      | 'onStopped'
      | 'onError'
      | 'onPaused'
      | 'onMuted'
      | 'onFaceCam',
    listener: (event: {
      message?: string;
      code?: string;
      error?: string;
      paused?: boolean;
      muted?: boolean;
      enabled?: boolean;
    }) => void,
  ) => { remove: () => void };
};

export type LiveDestination = { rtmpUrl: string; streamKey: string };

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
  destinations: LiveDestination[];
  /** Shown to viewers while the stream is paused ("be right back"). */
  bannerUri?: string | null;
}): Promise<LiveStartResult> | LiveStartResult {
  if (Platform.OS !== 'android') return 'unsupported';
  if (!native) return 'unavailable';
  if (native.isLive()) return 'started';
  const payload = options.destinations
    .map((d) => ({
      url: d.rtmpUrl.trim(),
      key: d.streamKey.trim(),
    }))
    .filter((d) => {
      if (!d.url) return false;
      // SRT (Kick/IVS): streamid may already be in the URL; key optional then.
      if (/^srt:\/\//i.test(d.url)) {
        return /streamid=[^&]+/i.test(d.url) || !!d.key;
      }
      return !!d.key;
    });
  if (payload.length === 0) {
    return Promise.reject(new Error('Pick at least one platform with URL + stream key'));
  }
  return native
    .start(JSON.stringify(payload), options.bannerUri?.trim() || '')
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

export function isLiveMuted(): boolean {
  return !!native?.isMuted?.();
}

/**
 * Mute is deliberately separate from pause: killing the mic for a moment
 * should not also drop the video to the 50 kbps slideshow pause uses.
 */
export function setLiveMuted(muted: boolean): Promise<void> {
  return native?.setMuted?.(muted) ?? Promise.resolve();
}

/** Front-camera PiP on the encoded frame. Default off. */
export function isLiveFaceCam(): boolean {
  return !!native?.isFaceCam?.();
}

export function setLiveFaceCam(enabled: boolean): Promise<void> {
  return native?.setFaceCam?.(enabled) ?? Promise.resolve();
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

export function addLiveMutedListener(
  listener: (muted: boolean) => void,
): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onMuted', (event) => {
    listener(!!event?.muted);
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

export function addLiveFaceCamListener(
  listener: (enabled: boolean) => void,
): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onFaceCam', (event) => {
    listener(!!event?.enabled);
  });
  return () => sub.remove();
}
