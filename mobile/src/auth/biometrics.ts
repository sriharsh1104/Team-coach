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

export async function promptBiometricAuth(message: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const LocalAuthentication = localAuth();
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: message,
  });
  return result.success;
}
