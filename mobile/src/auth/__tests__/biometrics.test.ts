import { Platform } from 'react-native';
import { isBiometricAvailable, promptBiometricAuth } from '../biometrics';

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(),
  isEnrolledAsync: jest.fn(),
  authenticateAsync: jest.fn(),
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
