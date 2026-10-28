import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { TwoFactorChallengeScreen } from '../TwoFactorChallengeScreen';
import { useAuth } from '../../auth/AuthContext';

jest.mock('../../auth/AuthContext');

const mockedUseAuth = useAuth as jest.Mock;
const route = { params: { challengeToken: 'challenge-token' } } as any;
const navigation = {} as any;

const completeTwoFactorLogin = jest.fn();

async function pressAndSettle(text: string) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockedUseAuth.mockReturnValue({ completeTwoFactorLogin });
});

describe('TwoFactorChallengeScreen', () => {
  it('submits the 6-digit code to completeTwoFactorLogin', async () => {
    completeTwoFactorLogin.mockResolvedValue(undefined);
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '123456');
    await pressAndSettle('Verify');

    expect(completeTwoFactorLogin).toHaveBeenCalledWith('challenge-token', { code: '123456' });
  });

  it('blocks submission until something is typed', async () => {
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    await pressAndSettle('Verify');
    expect(completeTwoFactorLogin).not.toHaveBeenCalled();
  });

  it('switches to backup-code mode and submits that instead', async () => {
    completeTwoFactorLogin.mockResolvedValue(undefined);
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    fireEvent.press(screen.getByText('Use a backup code instead'));
    fireEvent.changeText(screen.getByPlaceholderText('Backup code'), 'ABCDE-12345');
    await pressAndSettle('Verify');

    expect(completeTwoFactorLogin).toHaveBeenCalledWith('challenge-token', {
      backupCode: 'ABCDE-12345',
    });
  });

  it('shows an alert with the server message on failure', async () => {
    completeTwoFactorLogin.mockRejectedValue({
      response: { data: { message: 'Invalid code' } },
    });
    render(<TwoFactorChallengeScreen route={route} navigation={navigation} />);

    fireEvent.changeText(screen.getByPlaceholderText('6-digit code'), '000000');
    await pressAndSettle('Verify');

    expect(Alert.alert).toHaveBeenCalledWith('Could not verify', 'Invalid code');
  });
});
