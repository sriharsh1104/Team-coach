import { Platform } from 'react-native';

export type HapticKind =
  /** Light tick for ordinary taps — buttons, tabs, list rows. */
  | 'selection'
  /** Slightly weightier tap — toggles, sending a message, picking a card. */
  | 'light'
  /** Deliberate physical thud — rolling dice, starting a match. */
  | 'medium'
  | 'heavy'
  /** Outcome feedback — ties to the OS notification haptics. */
  | 'success'
  | 'warning'
  | 'error';

/** Babel often inlines NODE_ENV away from 'test' under Jest — detect jest itself. */
const SKIP =
  Platform.OS === 'web' ||
  typeof jest !== 'undefined' ||
  process.env.NODE_ENV === 'test';

type HapticsModule = typeof import('expo-haptics');

let cached: HapticsModule | null | undefined;

/** Lazy so web bundles and Jest never touch the native module. */
function load(): HapticsModule | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-haptics') as HapticsModule;
  } catch {
    cached = null;
  }
  return cached;
}

let enabled = true;

/** Lets Account settings turn the whole thing off without touching call sites. */
export function setHapticsEnabled(next: boolean) {
  enabled = next;
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/**
 * Fire-and-forget: haptics are decoration, so a device without a vibrator
 * (or a user who revoked VIBRATE) must never surface an error or block the
 * press handler that triggered it.
 */
export function haptic(kind: HapticKind = 'selection') {
  if (SKIP || !enabled) return;
  const H = load();
  if (!H) return;
  try {
    switch (kind) {
      case 'selection':
        void H.selectionAsync().catch(() => {});
        return;
      case 'light':
        void H.impactAsync(H.ImpactFeedbackStyle.Light).catch(() => {});
        return;
      case 'medium':
        void H.impactAsync(H.ImpactFeedbackStyle.Medium).catch(() => {});
        return;
      case 'heavy':
        void H.impactAsync(H.ImpactFeedbackStyle.Heavy).catch(() => {});
        return;
      case 'success':
        void H.notificationAsync(H.NotificationFeedbackType.Success).catch(
          () => {},
        );
        return;
      case 'warning':
        void H.notificationAsync(H.NotificationFeedbackType.Warning).catch(
          () => {},
        );
        return;
      case 'error':
        void H.notificationAsync(H.NotificationFeedbackType.Error).catch(
          () => {},
        );
        return;
    }
  } catch {
    /* ignore */
  }
}
