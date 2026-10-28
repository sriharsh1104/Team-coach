import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { AccountSettingsScreen } from '../AccountSettingsScreen';
import * as authApi from '../../api/auth';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/auth');
jest.mock('../../auth/AuthContext');

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn() } as any;

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

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUseAuth.mockReturnValue({ user: baseUser, applyAuthResponse, refreshUser });
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

  it('shows "Enable 2FA" navigating to setup when disabled', async () => {
    render(<AccountSettingsScreen navigation={navigation} route={{} as any} />);

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

    fireEvent.press(screen.getByText('Disable 2FA'));
    fireEvent.changeText(screen.getByPlaceholderText('Your password'), 'wrong');
    await pressAndSettle('Confirm Disable');

    expect(Alert.alert).toHaveBeenCalledWith('Could not disable 2FA', 'Incorrect password');
  });
});
