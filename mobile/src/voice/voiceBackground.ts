import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type NativeVoiceService = {
  startVoiceService?: (title: string, text: string) => boolean;
  stopVoiceService?: () => boolean;
};

function loadNative(): NativeVoiceService | null {
  // iOS keeps voice alive through UIBackgroundModes (audio + voip) and the
  // AudioSession; only Android needs a foreground service.
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<NativeVoiceService>('ScreenRecorder');
  } catch {
    return null;
  }
}

/**
 * Starts the Android foreground service ("In voice" notification) that stops
 * the OS from muting the mic / freezing the socket when the app goes to the
 * background. No-op on iOS and on older APKs without the native service.
 */
export function startVoiceBackground(title: string, text: string): void {
  try {
    loadNative()?.startVoiceService?.(title, text);
  } catch (err) {
    console.warn('startVoiceBackground failed (voice still works in foreground):', err);
  }
}

export function stopVoiceBackground(): void {
  try {
    loadNative()?.stopVoiceService?.();
  } catch {
    // ignore
  }
}
