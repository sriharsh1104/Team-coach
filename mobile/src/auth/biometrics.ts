import { Platform } from 'react-native';

// Lazy-required for the same reason as expo-secure-store in tokenStorage.ts
// — the native module doesn't exist on web, so a static import would pull
// it into the web bundle (and could throw) even though this path never runs
// there.
function localAuth() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-local-authentication') as typeof import('expo-local-authentication');
}

export async function isBiometricAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const LocalAuthentication = localAuth();
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}

export type BiometricKind = 'face' | 'fingerprint' | 'iris';

/**
 * What the OS actually reports as available — used only to label the toggle
 * accurately ("Fingerprint" vs "Face Unlock"), not to gate it.
 *
 * `supportedAuthenticationTypesAsync` reflects device *capability*, not
 * enrollment, so pair this with `isBiometricAvailable()` for the on/off gate.
 * Many Android phones (especially budget/mid-range OEM skins) implement
 * "Face Unlock" as a lock-screen-only feature that never registers with the
 * system BiometricManager at all — on those devices this legitimately comes
 * back without 'face', and no app can add that capability from outside.
 */
export async function getBiometricKinds(): Promise<BiometricKind[]> {
  if (Platform.OS === 'web') return [];
  const LocalAuthentication = localAuth();
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    const kinds: BiometricKind[] = [];
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      kinds.push('face');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      kinds.push('fingerprint');
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      kinds.push('iris');
    }
    return kinds;
  } catch {
    return [];
  }
}

const BIOMETRIC_KIND_LABEL: Record<BiometricKind, string> = {
  face: 'Face Unlock',
  fingerprint: 'Fingerprint',
  iris: 'Iris Unlock',
};

/** "Fingerprint", "Face Unlock", "Fingerprint & Face Unlock", etc. — built
 * from whatever the device actually reports, so the label never promises a
 * method that isn't really there. */
export function describeBiometricKinds(kinds: BiometricKind[]): string {
  if (kinds.length === 0) return 'Face ID / Touch ID';
  return kinds.map((k) => BIOMETRIC_KIND_LABEL[k]).join(' & ');
}

export async function promptBiometricAuth(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const LocalAuthentication = localAuth();
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
  });
  return result.success;
}
