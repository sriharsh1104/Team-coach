import React from 'react';
import { Alert, Switch } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { AccountSettingsScreen } from '../AccountSettingsScreen';
import * as authApi from '../../api/auth';
import { useAuth } from '../../auth/AuthContext';
import * as biometrics from '../../auth/biometrics';
import * as tokenStorage from '../../storage/tokenStorage';

jest.mock('../../api/auth');
jest.mock('../../auth/AuthContext');
jest.mock('../../auth/biometrics');
jest.mock('../../storage/tokenStorage', () => ({
  getBiometricEnabled: jest.fn(),
  setBiometricEnabled: jest.fn(),
}));

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockedUseAuth = useAuth as jest.Mock;
const mockedBiometrics = biometrics as jest.Mocked<typeof biometrics>;
const mockedTokenStorage = tokenStorage as jest.Mocked<typeof tokenStorage>;
const navigation = { navigate: jest.fn() } as any;

function openBiometricTab() {
  fireEvent.press(screen.getByLabelText('Biometric Login'));
}

const applyAuthResponse = jest.fn();
const refreshUser = jest.fn();

const baseUser = {
  id: 'user-1',
  email: 'me@example.com',
  name: 'Me',
  avatarUrl: null,
  phone: null,
  profileComplete: true,
  hasPassword: true,
  twoFactorEnabled: false,
};

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

function openTwoFactorTab() {
  fireEvent.press(screen.getByLabelText('Two-Factor Authentication'));
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUseAuth.mockReturnValue({ user: baseUser, applyAuthResponse, refreshUser });
  mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);
  mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);
  mockedTokenStorage.getBiometricEnabled.mockResolvedValue(false);
  mockedTokenStorage.setBiometricEnabled.mockResolvedValue(undefined);
});

describe('AccountSettingsScreen', () => {
  it('blocks the Change Password button until current+new+matching-confirm are filled', async () => {
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);

    await pressAndSettle('Update Password');
    expect(mockedAuthApi.changePassword).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'oldpass123');
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'newpass123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'mismatch');
    await pressAndSettle('Update Password');
    expect(mockedAuthApi.changePassword).not.toHaveBeenCalled();
  });

  it('changes the password, applies the fresh session, and clears the fields', async () => {
    mockedAuthApi.changePassword.mockResolvedValue({
      accessToken: 'fresh-token',
      user: baseUser,
      org: null,
    });
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);

    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'oldpass123');
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'newpass123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
    await pressAndSettle('Update Password');

    expect(mockedAuthApi.changePassword).toHaveBeenCalledWith('oldpass123', 'newpass123');
    expect(applyAuthResponse).toHaveBeenCalledWith({
      accessToken: 'fresh-token',
      user: baseUser,
      org: null,
    });
    expect(screen.getByPlaceholderText('Current password').props.value).toBe('');
  });

  it('shows a note instead of the password form for a Google-only account', () => {
    mockedUseAuth.mockReturnValue({
      user: { ...baseUser, hasPassword: false },
      applyAuthResponse,
      refreshUser,
    });
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);

    expect(
      screen.getByText('This account signs in with Google and has no password to change.'),
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText('Current password')).toBeNull();
  });

  it('defaults to the Password tab, with 2FA content hidden until its tab is pressed', () => {
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);

    expect(screen.getByLabelText('Change Password')).toBeTruthy();
    expect(screen.getByLabelText('Biometric Login')).toBeTruthy();
    expect(screen.getByPlaceholderText('Current password')).toBeTruthy();
    expect(screen.queryByText('Enable 2FA')).toBeNull();

    openTwoFactorTab();

    expect(screen.getByText('Enable 2FA')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Current password')).toBeNull();
  });

  it('shows "Enable 2FA" navigating to setup when disabled', async () => {
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
    openTwoFactorTab();

    fireEvent.press(screen.getByText('Enable 2FA'));
    expect(navigation.navigate).toHaveBeenCalledWith('TwoFactorSetup');
  });

  it('shows a Disable flow requiring the password when 2FA is enabled', async () => {
    mockedUseAuth.mockReturnValue({
      user: { ...baseUser, twoFactorEnabled: true },
      applyAuthResponse,
      refreshUser,
    });
    mockedAuthApi.disableTwoFactor.mockResolvedValue(undefined);
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
    openTwoFactorTab();

    fireEvent.press(screen.getByText('Disable 2FA'));
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'mypassword');
    await pressAndSettle('Confirm Disable');

    expect(mockedAuthApi.disableTwoFactor).toHaveBeenCalledWith('mypassword');
    expect(refreshUser).toHaveBeenCalled();
  });

  it('shows an alert when disabling 2FA fails', async () => {
    mockedUseAuth.mockReturnValue({
      user: { ...baseUser, twoFactorEnabled: true },
      applyAuthResponse,
      refreshUser,
    });
    mockedAuthApi.disableTwoFactor.mockRejectedValue({
      response: { data: { message: 'Incorrect password' } },
    });
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
    openTwoFactorTab();

    fireEvent.press(screen.getByText('Disable 2FA'));
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'wrong');
    await pressAndSettle('Confirm Disable');

    expect(Alert.alert).toHaveBeenCalledWith('Could not disable 2FA', 'Incorrect password');
  });

  describe('Biometric Login tab', () => {
    it('shows the native "unavailable" hint and no toggle when there is no hardware/enrollment', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);
      render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
      openBiometricTab();

      await screen.findByText(
        "Biometric login isn't available on this device (no Face ID/Touch ID/fingerprint set up).",
      );
      expect(screen.UNSAFE_queryAllByType(Switch)).toHaveLength(0);
    });

    it('shows the web-specific "unavailable" hint on web', async () => {
      const { Platform } = require('react-native');
      const originalOS = Platform.OS;
      Platform.OS = 'web';
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);
      render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
      openBiometricTab();

      await screen.findByText(
        "Biometric login isn't available in this browser preview — try it on a real device.",
      );

      Platform.OS = originalOS;
    });

    it('shows a toggle reflecting the stored preference when biometrics are available', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(true);
      render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
      openBiometricTab();

      await waitFor(() =>
        expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true),
      );
    });

    it('enabling requires a successful biometric prompt first, and persists only on success', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(false);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(true);
      render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
      openBiometricTab();
      await waitFor(() => expect(screen.UNSAFE_getByType(Switch)).toBeTruthy());

      await act(async () => {
        fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true);
      });

      expect(mockedBiometrics.promptBiometricAuth).toHaveBeenCalledWith(
        'Confirm to enable biometric login',
      );
      expect(mockedTokenStorage.setBiometricEnabled).toHaveBeenCalledWith(true);
      expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true);
    });

    it('does not persist enabling when the biometric prompt fails or is cancelled', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(false);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);
      render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
      openBiometricTab();
      await waitFor(() => expect(screen.UNSAFE_getByType(Switch)).toBeTruthy());

      await act(async () => {
        fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true);
      });

      expect(mockedTokenStorage.setBiometricEnabled).not.toHaveBeenCalled();
      expect(screen.UNSAFE_getByType(Switch).props.value).toBe(false);
    });

    it('disabling persists immediately without a biometric prompt', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(true);
      render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);
      openBiometricTab();
      await waitFor(() => expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true));

      await act(async () => {
        fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', false);
      });

      expect(mockedBiometrics.promptBiometricAuth).not.toHaveBeenCalled();
      expect(mockedTokenStorage.setBiometricEnabled).toHaveBeenCalledWith(false);
      expect(screen.UNSAFE_getByType(Switch).props.value).toBe(false);
    });
  });
});
