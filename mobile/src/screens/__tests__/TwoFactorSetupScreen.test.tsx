import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
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
  it('loads the secret/QR on mount and shows them for manual entry', async () => {
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);

    await screen.findByText('SECRETKEY123');
    expect(mockedAuthApi.setupTwoFactor).toHaveBeenCalledTimes(1);
  });

  it('disables Enable until a 6-digit code is entered', async () => {
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('SECRETKEY123');

    await pressAndSettle('Enable');
    expect(mockedAuthApi.enableTwoFactor).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123');
    await pressAndSettle('Enable');
    expect(mockedAuthApi.enableTwoFactor).not.toHaveBeenCalled();
  });

  it('enables 2FA with a valid code, refreshes the user, and shows backup codes once', async () => {
    mockedAuthApi.enableTwoFactor.mockResolvedValue({
      backupCodes: ['AAAAA-11111', 'BBBBB-22222'],
    });
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);
    await screen.findByText('SECRETKEY123');

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    await pressAndSettle('Enable');

    expect(mockedAuthApi.enableTwoFactor).toHaveBeenCalledWith('123456');
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
    await screen.findByText('SECRETKEY123');

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '000000');
    await pressAndSettle('Enable');

    expect(Alert.alert).toHaveBeenCalledWith('Could not enable 2FA', 'Invalid code');
    expect(screen.queryByText('Two-Factor Authentication Enabled')).toBeNull();
  });

  it('goes back with an alert if starting setup itself fails', async () => {
    mockedAuthApi.setupTwoFactor.mockRejectedValue({
      response: { data: { message: 'Server error' } },
    });
    render(<TwoFactorSetupScreen navigation={navigation} route={{} as any} />);

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(Alert.alert).toHaveBeenCalledWith('Could not start setup', 'Server error');
  });
});
