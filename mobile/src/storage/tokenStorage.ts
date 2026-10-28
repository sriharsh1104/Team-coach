import { Platform } from 'react-native';

// SecureStore only allows alphanumeric + ".", "-", "_" — no "/".
export const TOKEN_STORAGE_KEY = 'team-coach.accessToken';

// On web, never touch expo-secure-store — its native module is missing and
// importing/calling it throws. localStorage is fine for browser preview.
// On native, load SecureStore lazily so the web bundle doesn't pull it in
// through a static import graph either.
function nativeSecureStore() {
  // require (not dynamic import) so Jest can resolve the mocked module
  // without --experimental-vm-modules; Metro still tree-shakes this on web
  // because Platform.OS === 'web' never reaches here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-secure-store') as typeof import('expo-secure-store');
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  }
  const SecureStore = nativeSecureStore();
  return SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    return;
  }
  const SecureStore = nativeSecureStore();
  await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, token);
}

export async function deleteToken(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    return;
  }
  const SecureStore = nativeSecureStore();
  await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
}

// Opt-in preference for gating app-open with Face ID / Touch ID / fingerprint
// — stored as the string 'true'/absent rather than a real boolean since
// SecureStore only holds strings.
export const BIOMETRIC_ENABLED_KEY = 'team-coach.biometricEnabled';

export async function getBiometricEnabled(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
  }
  const SecureStore = nativeSecureStore();
  return (await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)) === 'true';
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    if (enabled) localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
    else localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    return;
  }
  const SecureStore = nativeSecureStore();
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  }
}
