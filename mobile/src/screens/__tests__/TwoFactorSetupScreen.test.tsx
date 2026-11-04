import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { TwoFactorSetupScreen } from '../TwoFactorSetupScreen';
import * as authApi from '../../api/auth';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../api/auth');
jest.mock('../../auth/AuthContext');

const mockedAuthApi = authApi as jest.Mocked<typeof authApi>;
const mockedUseAuth = useAuth as jest.Mock;
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

const refreshUser = jest.fn();

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

async function startSetup(password = 'CorrectPass1!') {
  fireEvent.changeText(screen.getByPlaceholderText('Password'), password);
  await pressAndSettle('Continue');
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUseAuth.mockReturnValue({ refreshUser });
  mockedAuthApi.setupTwoFactor.mockResolvedValue({
    secret: 'SECRETKEY123',
    qrCodeDataUrl: 'data:image/png;base64,abc',
  });
});

describe('TwoFactorSetupScreen', () => {
  it('asks for the current password before starting setup, then loads the secret/QR', async () => {
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('Confirm your password');
    expect(mockedAuthApi.setupTwoFactor).not.toHaveBeenCalled();

    await startSetup('CorrectPass1!');

    expect(mockedAuthApi.setupTwoFactor).toHaveBeenCalledWith('CorrectPass1!');
    await screen.findByText('SECRETKEY123');
  });

  it('shows an alert and stays on the password step if setup fails (e.g. wrong password)', async () => {
    mockedAuthApi.setupTwoFactor.mockRejectedValue({
      response: { data: { message: 'Incorrect password' } },
    });
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);
    await startSetup('WrongPass1!');

    expect(Alert.alert).toHaveBeenCalledWith('Could not start setup', 'Incorrect password');
    expect(screen.getByText('Confirm your password')).toBeTruthy();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('disables Enable until a 6-digit code is entered', async () => {
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);
    await startSetup();
    await screen.findByText('SECRETKEY123');

    await pressAndSettle('Enable');
    expect(mockedAuthApi.enableTwoFactor).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123');
    await pressAndSettle('Enable');
    expect(mockedAuthApi.enableTwoFactor).not.toHaveBeenCalled();
  });

  it('enables 2FA with the code and the same confirmed password, refreshes the user, and shows backup codes once', async () => {
    mockedAuthApi.enableTwoFactor.mockResolvedValue({
      backupCodes: ['AAAAA-11111', 'BBBBB-22222'],
    });
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);
    await startSetup('CorrectPass1!');
    await screen.findByText('SECRETKEY123');

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    await pressAndSettle('Enable');

    expect(mockedAuthApi.enableTwoFactor).toHaveBeenCalledWith('123456', 'CorrectPass1!');
    expect(refreshUser).toHaveBeenCalledTimes(1);
    await screen.findByText('Two-Factor Authentication Enabled');
    expect(screen.getByText('AAAAA-11111')).toBeTruthy();
    expect(screen.getByText('BBBBB-22222')).toBeTruthy();
  });

  it('shows an alert and does not reveal backup codes when the code is wrong', async () => {
    mockedAuthApi.enableTwoFactor.mockRejectedValue({
      response: { data: { message: 'Invalid code' } },
    });
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);
    await startSetup();
    await screen.findByText('SECRETKEY123');

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '000000');
    await pressAndSettle('Enable');

    expect(Alert.alert).toHaveBeenCalledWith('Could not enable 2FA', 'Invalid code');
    expect(screen.queryByText('Two-Factor Authentication Enabled')).toBeNull();
  });
});
