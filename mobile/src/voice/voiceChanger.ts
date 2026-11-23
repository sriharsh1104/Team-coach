import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type VoicePreset = 'off' | 'man' | 'woman' | 'girl' | 'child' | 'robot';

export const VOICE_PRESETS: Array<{ id: VoicePreset; label: string }> = [
  { id: 'off', label: 'Normal' },
  { id: 'man', label: 'Man' },
  { id: 'woman', label: 'Woman' },
  { id: 'girl', label: 'Girl' },
  { id: 'child', label: 'Kid' },
  { id: 'robot', label: 'Robot' },
];

export type VoiceChangerStatus = {
  /** The native effect is part of this build at all. */
  available: boolean;
  /** Hooked into the live WebRTC capture pipeline. */
  attached: boolean;
  preset: VoicePreset;
  /** Samples pushed through with a preset on — 0 means nothing is reaching us. */
  processedFrames: number;
  /** WebRTC handed us a buffer shape we cannot read; audio passes untouched. */
  layoutUnsupported: boolean;
  bandRate: number;
  bands: number;
  frames: number;
};

type NativeVoiceChanger = {
  isAvailable: () => boolean;
  isActive: () => boolean;
  attach: () => boolean;
  getPresets: () => string[];
  getPreset: () => string;
  setPreset: (name: string) => string;
  getStatus?: () => VoiceChangerStatus;
  playCue: () => boolean;
};

function loadNative(): NativeVoiceChanger | null {
  if (Platform.OS !== 'android') return null; // iOS/web: not built yet
  try {
    return requireOptionalNativeModule<NativeVoiceChanger>('VoiceChanger');
  } catch {
    return null;
  }
}

const native = loadNative();

/**
 * True when the native effect is wired into WebRTC's mic path (Android,
 * dev-client / APK build — never Expo Go or web).
 */
export function isVoiceChangerAvailable(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Hooks the effect into the live mic pipeline. The native side also retries on
 * its own; calling this when a voice session starts just makes it immediate
 * and re-attaches after a pipeline restart. Safe to call any number of times.
 */
export function attachVoiceChanger(): boolean {
  try {
    return !!native?.attach();
  } catch {
    return false;
  }
}

/**
 * What the effect is really doing. "I picked Woman and nothing changed" has
 * several causes that look identical from the UI — not attached yet, attached
 * but no audio flowing, or an unreadable buffer layout — so the picker reads
 * this instead of assuming the tap worked.
 *
 * Returns null on builds without the native module (iOS / web / Expo Go).
 */
export function getVoiceChangerStatus(): VoiceChangerStatus | null {
  try {
    return native?.getStatus?.() ?? null;
  } catch {
    return null;
  }
}

export function getVoicePreset(): VoicePreset {
  try {
    const p = native?.getPreset();
    return (p as VoicePreset) || 'off';
  } catch {
    return 'off';
  }
}

/**
 * Applies instantly — works before joining and mid-call. The effect lives
 * below both the mediasoup and LiveKit paths, so it covers whichever voice
 * backend is active.
 */
export function setVoicePreset(preset: VoicePreset): boolean {
  if (!native) return false;
  try {
    native.setPreset(preset);
    // The effect only runs once it is bolted onto the capture pipeline, which
    // does not exist until WebRTC has built its factory. Asking here means
    // picking a preset before joining still takes hold the moment the call
    // starts, rather than needing a second tap.
    native.attach?.();
    return true;
  } catch (err) {
    console.warn('setVoicePreset failed:', err);
    return false;
  }
}

/**
 * Short beep on the call stream — played when someone in the channel raises
 * their hand so people notice they want to speak. No-op where the native
 * module isn't available (iOS / web / Expo Go) or an older APK without it.
 */
export function playHandRaiseCue(): void {
  try {
    native?.playCue?.();
  } catch {
    // A missing beep must never break the call.
  }
}
