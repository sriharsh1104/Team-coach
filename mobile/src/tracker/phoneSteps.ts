import { PermissionsAndroid, Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

type NativePhoneSteps = {
  isAvailable: () => boolean;
  getTodaySteps: () => Promise<number | null>;
};

function loadNative(): NativePhoneSteps | null {
  if (Platform.OS !== 'android') return null;
  try {
    return requireOptionalNativeModule<NativePhoneSteps>('PhoneSteps');
  } catch {
    return null;
  }
}

const native = loadNative();

export async function requestActivityRecognition(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (Number(Platform.Version) < 29) return true;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

export function isPhoneStepCounterAvailable(): boolean {
  try {
    return !!native?.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Today's steps from the phone hardware counter (no Health Connect picker).
 * Returns null if the sensor/permission is missing.
 */
export async function readPhoneTodaySteps(): Promise<number | null> {
  if (!native) return null;
  try {
    if (!native.isAvailable()) return null;
    const n = await native.getTodaySteps();
    if (n == null || !Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  } catch {
    return null;
  }
}
