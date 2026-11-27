import React from 'react';
import { Alert, Switch } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { AccountSettingsScreen } from '../AccountSettingsScreen';
import * as authApi from '../../api/auth';
import * as usersApi from '../../api/users';
import { useAuth } from '../../auth/AuthContext';
import * as biometrics from '../../auth/biometrics';
import * as tokenStorage from '../../storage/tokenStorage';

jest.mock('../../api/auth');
jest.mock('../../api/users');
jest.mock('../../auth/AuthContext');
jest.mock('../../auth/biometrics', () => ({
  // describeBiometricKinds is a pure formatter — keep the real one so the
  // rendered label reflects whatever biometricKinds the test sets up,
  // instead of an auto-mocked stub returning undefined.
  ...jest.requireActual('../../auth/biometrics'),
  isBiometricAvailable: jest.fn(),
  getBiometricKinds: jest.fn(),
  promptBiometricAuth: jest.fn(),
}));
jest.mock('../../storage/tokenStorage', () => ({
  getBiometricEnabled: jest.fn(),
  setBiometricEnabled: jest.fn(),
}));

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockedUsersApi = usersApi as jest.Mocked<typeof usersApi>;
const mockedUseAuth = useAuth as jest.Mock;
const mockedBiometrics = biometrics as jest.Mocked<typeof biometrics>;
const mockedTokenStorage = tokenStorage as jest.Mocked<typeof tokenStorage>;
const navigation = {
  navigate: jest.fn(),
  push: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as any;

type Section =
  | 'password'
  | 'twoFactor'
  | 'biometric'
  | 'privacy'
  | 'sessions'
  | 'recovery'
  | 'danger';

function routeFor(section?: Section) {
  return {
    key: 'AccountSettings',
    name: 'AccountSettings',
    params: section ? { section } : undefined,
  } as any;
}

function renderAccount(section?: Section) {
  return render(
    <AccountSettingsScreen navigation={navigation} route={routeFor(section)} />,
  );
}

function openPasswordSection() {
  renderAccount('password');
}

function openBiometricTab() {
  renderAccount('biometric');
}

function openPrivacyTab() {
  renderAccount('privacy');
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
  renderAccount('twoFactor');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUseAuth.mockReturnValue({ user: baseUser, applyAuthResponse, refreshUser });
  mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);
  mockedBiometrics.getBiometricKinds.mockResolvedValue([]);
  mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);
  mockedTokenStorage.getBiometricEnabled.mockResolvedValue(false);
  mockedTokenStorage.setBiometricEnabled.mockResolvedValue(undefined);
});

describe('AccountSettingsScreen', () => {
  it('blocks the Change Password button until current+new+matching-confirm are filled', async () => {
    openPasswordSection();

    await pressAndSettle('Update Password');
    expect(mockedAuthApi.changePassword).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'oldpass123');
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'newpass123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'mismatch');
    await pressAndSettle('Update Password');
    expect(mockedAuthApi.changePassword).not.toHaveBeenCalled();
  });

  it('pushes a real stack entry when a hub row is pressed', () => {
    renderAccount();
    fireEvent.press(screen.getByLabelText('Change Password'));
    expect(navigation.push).toHaveBeenCalledWith('AccountSettings', {
      section: 'password',
    });
  });

  it('changes the password, applies the fresh session, and clears the fields', async () => {
    mockedAuthApi.changePassword.mockResolvedValue({
      accessToken: 'fresh-token',
      user: baseUser,
      org: null,
      guild: null,
    });
    openPasswordSection();

    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'oldpass123');
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'newpass123');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'newpass123');
    await pressAndSettle('Update Password');

    expect(mockedAuthApi.changePassword).toHaveBeenCalledWith('oldpass123', 'newpass123');
    expect(applyAuthResponse).toHaveBeenCalledWith({
      accessToken: 'fresh-token',
      user: baseUser,
      org: null,
      guild: null,
    });
    expect(screen.getByPlaceholderText('Current password').props.value).toBe('');
  });

  it('shows a note instead of the password form for a Google-only account', () => {
    mockedUseAuth.mockReturnValue({
      user: { ...baseUser, hasPassword: false },
      applyAuthResponse,
      refreshUser,
    });
    openPasswordSection();

    expect(
      screen.getByText('This account signs in with Google and has no password to change.'),
    ).toBeTruthy();
    expect(screen.queryByPlaceholderText('Current password')).toBeNull();
  });

  it('opens hub rows into detail panels, with password hidden until selected', () => {
    renderAccount();

    expect(screen.getByLabelText('Change Password')).toBeTruthy();
    expect(screen.getByLabelText('Biometric Login')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Current password')).toBeNull();
    expect(screen.queryByText('Enable 2FA')).toBeNull();

    fireEvent.press(screen.getByLabelText('Change Password'));
    expect(navigation.push).toHaveBeenCalledWith('AccountSettings', {
      section: 'password',
    });

    openPasswordSection();
    expect(screen.getByPlaceholderText('Current password')).toBeTruthy();

    openTwoFactorTab();
    expect(screen.getByText('Enable 2FA')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Current password')).toBeNull();
  });

  it('shows "Enable 2FA" navigating to setup when disabled', async () => {
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
    openTwoFactorTab();

    fireEvent.press(screen.getByText('Disable 2FA'));
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'wrong');
    await pressAndSettle('Confirm Disable');

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  describe('Biometric Login tab', () => {
    it('shows the native "unavailable" hint and no toggle when there is no hardware/enrollment', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(false);
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
      openBiometricTab();

      await screen.findByText(
        "Biometric login isn't available in this browser preview — try it on a real device.",
      );

      Platform.OS = originalOS;
    });

    it('shows a toggle reflecting the stored preference when biometrics are available', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(true);
      openBiometricTab();

      await waitFor(() =>
        expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true),
      );
    });

    it('enabling requires a successful biometric prompt first, and persists only on success', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(false);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(true);
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
      openBiometricTab();
      await waitFor(() => expect(screen.UNSAFE_getByType(Switch)).toBeTruthy());

      await act(async () => {
        fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', true);
      });

      expect(mockedTokenStorage.setBiometricEnabled).not.toHaveBeenCalled();
      expect(screen.UNSAFE_getByType(Switch).props.value).toBe(false);
    });

    it('disabling also requires a successful biometric prompt', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(true);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(true);
      openBiometricTab();
      await waitFor(() => expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true));

      await act(async () => {
        fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', false);
      });

      expect(mockedBiometrics.promptBiometricAuth).toHaveBeenCalledWith(
        'Confirm to disable biometric login',
      );
      expect(mockedTokenStorage.setBiometricEnabled).toHaveBeenCalledWith(false);
      expect(screen.UNSAFE_getByType(Switch).props.value).toBe(false);
    });

    it('does not disable when the biometric prompt is cancelled', async () => {
      mockedBiometrics.isBiometricAvailable.mockResolvedValue(true);
      mockedTokenStorage.getBiometricEnabled.mockResolvedValue(true);
      mockedBiometrics.promptBiometricAuth.mockResolvedValue(false);
      openBiometricTab();
      await waitFor(() => expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true));

      await act(async () => {
        fireEvent(screen.UNSAFE_getByType(Switch), 'valueChange', false);
      });

      expect(mockedTokenStorage.setBiometricEnabled).not.toHaveBeenCalled();
      expect(screen.UNSAFE_getByType(Switch).props.value).toBe(true);
    });
  });

  describe('Privacy tab', () => {
    beforeEach(() => {
      mockedUsersApi.getMyProfile.mockResolvedValue({
        id: 'user-1',
        name: 'Me',
        avatarUrl: null,
        roles: [],
        inGameName: null,
        inGameUid: null,
        phone: '9988776655',
        whatsappUrl: 'https://wa.me/9988776655',
        instagramUrl: null,
        discordUrl: null,
        youtubeUrl: null,
        kickUrl: null,
        showPhoneToMembers: false,
        showWhatsappToMembers: true,
        showInstagramToMembers: true,
        showDiscordToMembers: true,
        showYoutubeToMembers: true,
        showKickToMembers: true,
        devices: [],
        role: null,
        isOwner: false,
      });
      mockedUsersApi.updateMyProfile.mockImplementation(async (input) => ({
        id: 'user-1',
        name: 'Me',
        avatarUrl: null,
        roles: [],
        inGameName: null,
        inGameUid: null,
        phone: '9988776655',
        whatsappUrl: 'https://wa.me/9988776655',
        instagramUrl: null,
        discordUrl: null,
        youtubeUrl: null,
        kickUrl: null,
        showPhoneToMembers: false,
        showWhatsappToMembers: true,
        showInstagramToMembers: true,
        showDiscordToMembers: true,
        showYoutubeToMembers: true,
        showKickToMembers: true,
        ...input,
        devices: [],
        role: null,
        isOwner: false,
      }));
    });

    it('loads visibility toggles and saves when phone is turned on', async () => {
      openPrivacyTab();

      await waitFor(() =>
        expect(
          screen.getByLabelText('Show Phone Number to teammates'),
        ).toBeTruthy(),
      );
      expect(mockedUsersApi.getMyProfile).toHaveBeenCalled();

      const phoneSwitch = screen.getByLabelText('Show Phone Number to teammates');
      expect(phoneSwitch.props.value).toBe(false);

      await act(async () => {
        fireEvent(phoneSwitch, 'valueChange', true);
      });

      await waitFor(() =>
        expect(mockedUsersApi.updateMyProfile).toHaveBeenCalledWith({
          showPhoneToMembers: true,
        }),
      );
      expect(phoneSwitch.props.value).toBe(true);
    });

    it('toggles Free Fire IGN visibility via game-profile privacy', async () => {
      mockedUsersApi.setGameProfileVisibility.mockResolvedValue({
        id: 'user-1',
        name: 'Me',
        avatarUrl: null,
        roles: [],
        inGameName: null,
        inGameUid: null,
        phone: null,
        whatsappUrl: null,
        instagramUrl: null,
        discordUrl: null,
        youtubeUrl: null,
        kickUrl: null,
        showPhoneToMembers: false,
        showWhatsappToMembers: true,
        showInstagramToMembers: true,
        showDiscordToMembers: true,
        showYoutubeToMembers: true,
        showKickToMembers: true,
        gameProfiles: [
          {
            game: 'FREE_FIRE',
            inGameName: 'Shadow',
            inGameUid: '123',
            role: 'IGL',
            showNameToMembers: false,
            showUidToMembers: true,
          },
        ],
        devices: [],
        role: null,
        isOwner: false,
      });
      openPrivacyTab();

      await waitFor(() =>
        expect(
          screen.getByLabelText('Show Free Fire IGN to teammates'),
        ).toBeTruthy(),
      );

      const ignSwitch = screen.getByLabelText(
        'Show Free Fire IGN to teammates',
      );
      expect(ignSwitch.props.value).toBe(true);

      await act(async () => {
        fireEvent(ignSwitch, 'valueChange', false);
      });

      await waitFor(() =>
        expect(mockedUsersApi.setGameProfileVisibility).toHaveBeenCalledWith({
          game: 'FREE_FIRE',
          showNameToMembers: false,
        }),
      );
    });
  });
});
