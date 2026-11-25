import { Platform } from 'react-native';
import {
  describeBiometricKinds,
  getBiometricKinds,
  isBiometricAvailable,
  promptBiometricAuth,
} from '../biometrics';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
}));

const LocalAuthentication = jest.requireMock('expo-local-authentication');

const originalOS = Platform.OS;

afterEach(() => {
  (Platform as any).OS = originalOS;
  jest.clearAllMocks();
});

describe('isBiometricAvailable', () => {
  it('is always false on web, without touching the native module', async () => {
    (Platform as any).OS = 'web';
    expect(await isBiometricAvailable()).toBe(false);
    expect(LocalAuthentication.hasHardwareAsync).not.toHaveBeenCalled();
  });

  it('is false when there is no scanner hardware', async () => {
    (Platform as any).OS = 'ios';
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(false);
    expect(await isBiometricAvailable()).toBe(false);
    expect(LocalAuthentication.isEnrolledAsync).not.toHaveBeenCalled();
  });

  it('is false when hardware exists but nothing is enrolled', async () => {
    (Platform as any).OS = 'android';
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(false);
    expect(await isBiometricAvailable()).toBe(false);
  });

  it('is true when hardware exists and is enrolled', async () => {
    (Platform as any).OS = 'ios';
    LocalAuthentication.hasHardwareAsync.mockResolvedValue(true);
    LocalAuthentication.isEnrolledAsync.mockResolvedValue(true);
    expect(await isBiometricAvailable()).toBe(true);
  });
});

describe('promptBiometricAuth', () => {
  it('is always false on web, without touching the native module', async () => {
    (Platform as any).OS = 'web';
    expect(await promptBiometricAuth('Unlock')).toBe(false);
    expect(LocalAuthentication.authenticateAsync).not.toHaveBeenCalled();
  });

  it('resolves true on a successful scan, passing the prompt message through', async () => {
    (Platform as any).OS = 'ios';
    LocalAuthentication.authenticateAsync.mockResolvedValue({ success: true });
    expect(await promptBiometricAuth('Unlock Team Coach')).toBe(true);
    expect(LocalAuthentication.authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock Team Coach',
    });
  });

  it('resolves false when the scan fails or is cancelled', async () => {
    (Platform as any).OS = 'ios';
    LocalAuthentication.authenticateAsync.mockResolvedValue({
      success: false,
      error: 'user_cancel',
    });
    expect(await promptBiometricAuth('Unlock')).toBe(false);
  });
});

describe('getBiometricKinds', () => {
  it('is empty on web, without touching the native module', async () => {
    (Platform as any).OS = 'web';
    expect(await getBiometricKinds()).toEqual([]);
    expect(LocalAuthentication.supportedAuthenticationTypesAsync).not.toHaveBeenCalled();
  });

  it('maps fingerprint-only devices to just fingerprint', async () => {
    (Platform as any).OS = 'android';
    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([1]);
    expect(await getBiometricKinds()).toEqual(['fingerprint']);
  });

  it('reports face when the OS exposes facial recognition to apps', async () => {
    (Platform as any).OS = 'android';
    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([1, 2]);
    expect(await getBiometricKinds()).toEqual(['face', 'fingerprint']);
  });

  it('does not report face when the device only exposes fingerprint to apps', async () => {
    // This is the real-world case behind "I don't see a Face Unlock option":
    // some Android OEM skins implement face unlock as a lock-screen-only
    // feature that never registers with the system BiometricManager, so it
    // never shows up here even though the phone itself can unlock with it.
    (Platform as any).OS = 'android';
    LocalAuthentication.supportedAuthenticationTypesAsync.mockResolvedValue([1]);
    const kinds = await getBiometricKinds();
    expect(kinds).not.toContain('face');
  });

  it('resolves empty if the native call throws, instead of rejecting', async () => {
    (Platform as any).OS = 'android';
    LocalAuthentication.supportedAuthenticationTypesAsync.mockRejectedValue(
      new Error('boom'),
    );
    expect(await getBiometricKinds()).toEqual([]);
  });
});

describe('describeBiometricKinds', () => {
  it('falls back to the generic label when nothing specific is known', () => {
    expect(describeBiometricKinds([])).toBe('Face ID / Touch ID');
  });

  it('names a single kind directly', () => {
    expect(describeBiometricKinds(['fingerprint'])).toBe('Fingerprint');
    expect(describeBiometricKinds(['face'])).toBe('Face Unlock');
  });

  it('joins multiple kinds', () => {
    expect(describeBiometricKinds(['face', 'fingerprint'])).toBe(
      'Face Unlock & Fingerprint',
    );
  });
});
