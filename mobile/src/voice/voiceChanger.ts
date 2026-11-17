import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type VoicePreset = 'off' | 'man' | 'woman' | 'girl' | 'child' | 'robot';

export const VOICE_PRESETS: Array<{ id: VoicePreset; label: string }> = [
  { id: 'off', label: 'Normal' },
  { id: 'man', label: 'Man' },
  { id: 'woman', label: 'Woman' },
  { id: 'girl', label: 'Girl' },
  { id: 'child', label: 'Child' },
  { id: 'robot', label: 'Robot' },
];

type NativeVoiceChanger = {
  isAvailable: () => boolean;
  getPresets: () => string[];
  getPreset: () => string;
  setPreset: (name: string) => string;
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
    return true;
  } catch (err) {
    console.warn('setVoicePreset failed:', err);
    return false;
  }
}
