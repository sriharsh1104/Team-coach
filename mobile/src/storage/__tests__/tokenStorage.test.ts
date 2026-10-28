import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  BIOMETRIC_ENABLED_KEY,
  getBiometricEnabled,
  setBiometricEnabled,
} from '../tokenStorage';

// jest-expo's test environment has no DOM, so `localStorage` (used by the
// web branch of tokenStorage.ts, which only ever runs in an actual browser)
// doesn't exist here — a minimal in-memory stand-in is enough to exercise it.
const localStorageMemory = new Map<string, string>();
(global as any).localStorage = {
  getItem: (key: string) => localStorageMemory.get(key) ?? null,
  setItem: (key: string, value: string) => localStorageMemory.set(key, value),
  removeItem: (key: string) => localStorageMemory.delete(key),
  clear: () => localStorageMemory.clear(),
};

const originalOS = Platform.OS;

afterEach(() => {
  (Platform as any).OS = originalOS;
  (SecureStore as any).clear();
  localStorage.clear();
});

describe('getBiometricEnabled / setBiometricEnabled', () => {
  describe('web', () => {
    beforeEach(() => {
      (Platform as any).OS = 'web';
    });

    it('defaults to false when nothing has been stored', async () => {
      expect(await getBiometricEnabled()).toBe(false);
    });

    it('persists true via localStorage', async () => {
      await setBiometricEnabled(true);
      expect(localStorage.getItem(BIOMETRIC_ENABLED_KEY)).toBe('true');
      expect(await getBiometricEnabled()).toBe(true);
    });

    it('removes the key on disable rather than storing a falsy string', async () => {
      await setBiometricEnabled(true);
      await setBiometricEnabled(false);
      expect(localStorage.getItem(BIOMETRIC_ENABLED_KEY)).toBeNull();
      expect(await getBiometricEnabled()).toBe(false);
    });
  });

  describe('native', () => {
    beforeEach(() => {
      (Platform as any).OS = 'ios';
    });

    it('defaults to false when nothing has been stored', async () => {
      expect(await getBiometricEnabled()).toBe(false);
    });

    it('persists true via SecureStore', async () => {
      await setBiometricEnabled(true);
      expect(await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)).toBe('true');
      expect(await getBiometricEnabled()).toBe(true);
    });

    it('deletes the key on disable', async () => {
      await setBiometricEnabled(true);
      await setBiometricEnabled(false);
      expect(await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY)).toBeNull();
      expect(await getBiometricEnabled()).toBe(false);
    });
  });
});
