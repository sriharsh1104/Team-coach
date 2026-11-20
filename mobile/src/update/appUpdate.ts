import { Linking, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { apiBaseUrl } from '../api/client';

export type UpdateInfo = {
  updateAvailable: boolean;
  /** Installed build is below the server's minimum — the popup cannot be dismissed. */
  forced: boolean;
  latestVersion: string | null;
  apkUrl: string | null;
  notes: string | null;
};

/** Version of the APK that is installed right now. */
export function currentAppVersion(): string {
  return Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Asks the backend whether a newer APK exists. Android only (the APK is the
 * distribution channel); every failure resolves to null so a flaky network
 * never blocks the app.
 */
export async function checkForUpdate(timeoutMs = 8000): Promise<UpdateInfo | null> {
  if (Platform.OS !== 'android') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `${apiBaseUrl.replace(/\/$/, '')}/app/update?version=${encodeURIComponent(currentAppVersion())}`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const info = (await res.json()) as UpdateInfo;
    if (!info?.updateAvailable || !info.apkUrl) return null;
    return info;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const APK_MIME = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const FLAG_ACTIVITY_NEW_TASK = 268435456;

export type InstallResult = 'installer-opened' | 'opened-in-browser' | 'failed';

/**
 * Downloads the APK inside the app (with progress) and opens Android's
 * installer. If the in-app route fails for any reason (blocked host, no
 * space, installer unavailable) it falls back to opening the link in the
 * browser so the user can still download it.
 */
export async function downloadAndInstall(
  apkUrl: string,
  onProgress?: (fraction: number) => void,
): Promise<InstallResult> {
  try {
    const target = `${FileSystem.cacheDirectory}sacred-update.apk`;
    await FileSystem.deleteAsync(target, { idempotent: true });
    const download = FileSystem.createDownloadResumable(apkUrl, target, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) {
        onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
      }
    });
    const result = await download.downloadAsync();
    if (!result || result.status !== 200) throw new Error(`download failed (${result?.status})`);
    onProgress?.(1);

    const contentUri = await FileSystem.getContentUriAsync(result.uri);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: APK_MIME,
      flags: FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK,
    });
    return 'installer-opened';
  } catch (err) {
    console.warn('In-app update failed, opening the link instead:', err);
    try {
      await Linking.openURL(apkUrl);
      return 'opened-in-browser';
    } catch {
      return 'failed';
    }
  }
}
