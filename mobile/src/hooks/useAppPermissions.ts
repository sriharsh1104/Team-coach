import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Audio } from 'expo-av';

/**
 * Every permission the app can ask for, in the order the first-launch pass
 * requests them: the two that gate the headline features first, then the ones
 * a specific screen needs.
 */
export const APP_PERMISSIONS = [
  'notifications',
  'microphone',
  'camera',
  'photos',
  'music',
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export type PermissionState = 'granted' | 'denied' | 'unknown';

export const PERMISSION_LABELS: Record<
  AppPermission,
  { title: string; why: string }
> = {
  notifications: {
    title: 'Notifications',
    why: 'Guild announcements, chat messages and voice invites.',
  },
  microphone: {
    title: 'Microphone',
    why: 'Talking in team and guild voice channels.',
  },
  camera: {
    title: 'Camera',
    why: 'Turning on video in a voice channel.',
  },
  photos: {
    title: 'Photos',
    why: 'Setting an avatar and posting screenshots to your team.',
  },
  music: {
    title: 'Music',
    why: 'Sharing a song from this device in voice.',
  },
};

/**
 * Set once the first-launch pass has run. Android shows a permission dialog
 * only the first time it is asked anyway, but without this flag the app would
 * re-ask on every cold start on iOS and — worse — put itself through a
 * background/foreground cycle each time, which makes the API rate limiter
 * answer 429 (see the Share Music bug).
 */
const ASKED_KEY = 'team-coach.permissionsAsked';

/** Same lazy-require pattern ThemeContext uses so web never pulls it in. */
function nativeStore() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

async function hasAsked(): Promise<boolean> {
  try {
    return !!(await nativeStore().getItemAsync(ASKED_KEY));
  } catch {
    return false;
  }
}

async function markAsked(): Promise<void> {
  try {
    await nativeStore().setItemAsync(ASKED_KEY, '1');
  } catch {
    // Worst case we ask again next launch — not worth failing the pass over.
  }
}

/**
 * Android 13+ needs the audio bucket named explicitly; on older Android and
 * on iOS this argument is ignored.
 */
const AUDIO_GRANULAR = { granularPermissions: ['audio' as const] };

function toState(granted: boolean | undefined): PermissionState {
  if (granted === undefined) return 'unknown';
  return granted ? 'granted' : 'denied';
}

async function checkOne(permission: AppPermission): Promise<PermissionState> {
  try {
    switch (permission) {
      case 'notifications':
        return toState((await Notifications.getPermissionsAsync()).granted);
      case 'microphone':
        return toState((await Audio.getPermissionsAsync()).granted);
      case 'camera':
        return toState((await ImagePicker.getCameraPermissionsAsync()).granted);
      case 'photos':
        return toState(
          (await ImagePicker.getMediaLibraryPermissionsAsync()).granted,
        );
      case 'music':
        return toState(
          (await MediaLibrary.getPermissionsAsync(false, AUDIO_GRANULAR as never))
            .granted,
        );
    }
  } catch {
    // A module missing its native side (Expo Go, web) must not break the list.
    return 'unknown';
  }
}

async function requestOne(permission: AppPermission): Promise<PermissionState> {
  try {
    switch (permission) {
      case 'notifications':
        return toState((await Notifications.requestPermissionsAsync()).granted);
      case 'microphone':
        return toState((await Audio.requestPermissionsAsync()).granted);
      case 'camera':
        return toState(
          (await ImagePicker.requestCameraPermissionsAsync()).granted,
        );
      case 'photos':
        return toState(
          (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted,
        );
      case 'music':
        return toState(
          (
            await MediaLibrary.requestPermissionsAsync(
              false,
              AUDIO_GRANULAR as never,
            )
          ).granted,
        );
    }
  } catch {
    return 'unknown';
  }
}

export async function checkAppPermissions(): Promise<
  Record<AppPermission, PermissionState>
> {
  const entries = await Promise.all(
    APP_PERMISSIONS.map(async (p) => [p, await checkOne(p)] as const),
  );
  return Object.fromEntries(entries) as Record<AppPermission, PermissionState>;
}

/**
 * Ask for one permission from inside the app.
 *
 * Once a permission has been hard-denied the OS stops showing its dialog, so
 * asking again silently does nothing. In that case the only route left is the
 * system settings page — the caller gets `denied` back and should offer it.
 */
export async function requestAppPermission(
  permission: AppPermission,
): Promise<PermissionState> {
  if ((await checkOne(permission)) === 'granted') return 'granted';
  return requestOne(permission);
}

export function openAppSettings() {
  void Linking.openSettings().catch(() => undefined);
}

/**
 * First-launch pass: ask for everything up front so nobody meets a permission
 * dialog in the middle of joining a call. Runs once per install — anything
 * turned down here can be granted later from Account Settings → Permissions.
 */
export function useAppPermissions() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let cancelled = false;
    void (async () => {
      try {
        if (await hasAsked()) return;
        for (const permission of APP_PERMISSIONS) {
          if (cancelled) return;
          // Sequential on purpose: Android queues dialogs, and firing them in
          // parallel shows one and silently drops the rest.
          await requestOne(permission);
        }
        await markAsked();
      } catch {
        // Non-fatal: each feature still asks for what it needs on first use.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}

/** Live permission list for the in-app Permissions section. */
export function usePermissionStates() {
  const [states, setStates] = useState<Record<AppPermission, PermissionState>>(
    () =>
      Object.fromEntries(APP_PERMISSIONS.map((p) => [p, 'unknown'])) as Record<
        AppPermission,
        PermissionState
      >,
  );

  const refresh = useCallback(async () => {
    setStates(await checkAppPermissions());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const request = useCallback(
    async (permission: AppPermission) => {
      const next = await requestAppPermission(permission);
      setStates((prev) => ({ ...prev, [permission]: next }));
      return next;
    },
    [],
  );

  return { states, refresh, request };
}
