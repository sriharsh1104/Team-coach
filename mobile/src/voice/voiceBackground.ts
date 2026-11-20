import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export type VoiceNotificationAction = 'mute' | 'deafen' | 'leave';

type NativeVoiceService = {
  startVoiceService?: (title: string, text: string, muted: boolean, deafened: boolean) => boolean;
  stopVoiceService?: () => boolean;
  addListener?: (
    event: 'onVoiceAction',
    listener: (event: { action: VoiceNotificationAction }) => void,
  ) => { remove: () => void };
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
 * Starts (or refreshes) the Android foreground service ("In voice" notification)
 * that stops the OS from muting the mic / freezing the socket when the app
 * goes to the background. Also carries the current mute/deafen state so the
 * notification's own Mute/Deafen buttons show the right label — call this
 * again any time either changes. No-op on iOS and on older APKs without the
 * native service.
 */
export function startVoiceBackground(
  title: string,
  text: string,
  state: { muted?: boolean; deafened?: boolean } = {},
): void {
  try {
    loadNative()?.startVoiceService?.(title, text, !!state.muted, !!state.deafened);
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

/**
 * Fires when the user taps Mute / Deafen / Leave on the ongoing-call
 * notification while the app is backgrounded — same three actions WhatsApp's
 * call notification offers. No-op (never fires) on iOS or without the native
 * module.
 */
export function addVoiceNotificationActionListener(
  listener: (action: VoiceNotificationAction) => void,
): () => void {
  const native = loadNative();
  if (!native?.addListener) return () => undefined;
  const sub = native.addListener('onVoiceAction', (event) => {
    if (event?.action) listener(event.action);
  });
  return () => sub.remove();
}
